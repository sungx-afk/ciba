import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ------------------------------------------------------------------
 * 1. 基础配置与通用 API 客户端
 * ------------------------------------------------------------------
 */

export const API_CONFIG = {
  baseUrl: 'https://cibaen.com/api',
  legacyBaseUrl: 'https://ciba.gorld.com',
  timeout: 10000,
};

const BASE_URL = 'https://cibaen.com/api';
const APP_ID = 'ciba_ios_app';
const PLAT = 'ios';

const TOKEN_KEY = '@ciba_token';
const TOKEN_STORAGE_KEY = '@ciba_auth_token';
const USER_STORAGE_KEY = '@ciba_user_info';

export class APIError extends Error {
  result: number;
  constructor(result: number, msg: string) {
    super(msg || '网络请求失败');
    this.name = 'APIError';
    this.result = result;
  }
}

export const AUTH_EXPIRED_RESULT = -10001;

let tokenCache: string | null = null;

export async function getToken(): Promise<string> {
  if (tokenCache !== null) return tokenCache;
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  tokenCache = t;
  return t || '';
}

export async function setToken(token: string | null) {
  tokenCache = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function buildUrl(path: string, query?: Record<string, any>): string {
  const pairs: string[] = [
    `${encodeURIComponent('plat')}=${encodeURIComponent(PLAT)}`,
    `${encodeURIComponent('app_id')}=${encodeURIComponent(APP_ID)}`,
  ];
  if (tokenCache) pairs.push(`token=${encodeURIComponent(tokenCache)}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return `${BASE_URL}${path}?${pairs.join('&')}`;
}

function buildFormBody(form?: Record<string, any>): string {
  if (!form) return '';
  return Object.entries(form)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

interface Envelope {
  result: number;
  msg?: string;
  [key: string]: any;
}

async function request<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: {
    query?: Record<string, any>;
    body?: Record<string, any>;
    encoding?: 'json' | 'form';
  }
): Promise<T> {
  const url = buildUrl(path, options?.query);
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (method !== 'GET' && options?.body !== undefined) {
    if (options.encoding === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = buildFormBody(options.body);
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(url, { method, headers, body });
  if (!res.ok) {
    throw new APIError(-1, `HTTP ${res.status}`);
  }

  const env: Envelope = await res.json();
  if (env.result !== 0) {
    throw new APIError(env.result, env.msg || '请求失败');
  }
  return env as T;
}

export const api = {
  get: <T = any>(path: string, query?: Record<string, any>) =>
    request<T>('GET', path, { query }),
  post: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('POST', path, { body, encoding: 'json' }),
  patch: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('PATCH', path, { body, encoding: 'json' }),
  postForm: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('POST', path, { body, encoding: 'form' }),
  del: <T = any>(path: string) =>
    request<T>('DELETE', path),
};

/**
 * ------------------------------------------------------------------
 * 2. 认证、短信、邮箱与社交登录相关 API
 * ------------------------------------------------------------------
 */

export interface UserInfo {
  id: number | string;
  nickname: string;
  loginName?: string;
  mobile?: string;
  email?: string;
  avatarUrl?: string;
  sex?: number;
  vip?: number;
  due?: string;
  token?: string;
}

export interface ApiResponse<T = any> {
  result: number;
  msg?: string;
  token?: string;
  user?: UserInfo;
  [key: string]: any;
}

export async function requestApi<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    params?: Record<string, any>;
    data?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResponse<T>> {
  const method = options.method || 'GET';
  let url = path.startsWith('http')
    ? path
    : `${API_CONFIG.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  if (options.params) {
    const query = Object.entries(options.params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query;
    }
  }

  const token = (await AsyncStorage.getItem(TOKEN_KEY)) || (await AsyncStorage.getItem(TOKEN_STORAGE_KEY));

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { token: token, Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), API_CONFIG.timeout);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (method !== 'GET' && options.data) {
      fetchOptions.body = JSON.stringify(options.data);
    }

    const res = await fetch(url, fetchOptions);
    clearTimeout(timeoutTimer);

    const json = await res.json().catch(() => ({
      result: res.ok ? 1 : -1,
      msg: `服务器返回异常 (HTTP ${res.status})`,
    }));

    return json;
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    console.warn(`[API Request Error] ${method} ${url}:`, err);

    if (err.name === 'AbortError') {
      return { result: -1, msg: '网络请求超时，请检查网络连接' };
    }
    return { result: -1, msg: err.message || '网络请求失败，请稍后重试' };
  }
}

export const AuthApi = {
  // 1. 发送短信验证码 (阿里云短信)
  sendMobileCode: async (mobile: string, scene = 'login') => {
    return requestApi('/verify_code/mobile/send', {
      method: 'POST',
      params: { mobile, scene },
    });
  },

  // 2. 发送邮箱验证码 (阿里云邮件)
  sendEmailCode: async (email: string, scene = 'register') => {
    return requestApi('/verify_code/email/code', {
      method: 'POST',
      params: { email, scene },
    });
  },

  // 3. 短信+验证码动态登录 (免密快速登录/注册)
  mobileLogin: async (mobile: string, code: string, deviceInfo?: any) => {
    return requestApi('/users/mobile/login', {
      method: 'POST',
      data: {
        mobile,
        code,
        plat: 'iOS',
        platVersion: '1.0.0',
        ...deviceInfo,
      },
    });
  },

  // 4. 手机号+密码注册
  registerByMobile: async (params: {
    mobile: string;
    code: string;
    password: string;
    nickname?: string;
  }) => {
    return requestApi('/users/register/mobile', {
      method: 'POST',
      data: {
        ...params,
        plat: 'iOS',
      },
    });
  },

  // 5. 邮箱注册
  registerByEmail: async (params: {
    email: string;
    code: string;
    password: string;
    nickname?: string;
  }) => {
    return requestApi('/users/register/email', {
      method: 'POST',
      data: {
        ...params,
        plat: 'iOS',
      },
    });
  },

  // 6. 邮箱/用户名+密码登录
  emailLogin: async (emailOrLoginName: string, password: string) => {
    return requestApi('/users/login/email', {
      method: 'POST',
      data: {
        email: emailOrLoginName,
        password,
        plat: 'iOS',
      },
    });
  },

  // 7. 微信客户端授权注册并登录
  wechatAppLogin: async (wechatParams: {
    code?: string;
    openid?: string;
    unionid?: string;
    nickname?: string;
    headimgurl?: string;
    sex?: number;
  }) => {
    return requestApi('/users/oauth2/wechat/app/login', {
      method: 'POST',
      data: {
        ...wechatParams,
        plat: 'iOS',
      },
    });
  },

  // 8. 忘记密码 / 重置密码
  resetPassword: async (params: {
    account: string;
    code: string;
    newPassword: string;
  }) => {
    return requestApi('/users/password/reset', {
      method: 'POST',
      data: params,
    });
  },

  // 9. 修改密码 (已登录用户)
  changePassword: async (params: {
    oldPassword?: string;
    newPassword: string;
  }) => {
    return requestApi('/users/password/update', {
      method: 'POST',
      data: params,
    });
  },

  // 10. 获取当前登录用户信息
  getMyInfo: async () => {
    return requestApi('/users/my');
  },
};
