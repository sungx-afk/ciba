import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_CONFIG = {
  // 生产与默认服务器地址
  baseUrl: 'https://ciba.gorld.com',
  // 请求超时时间(ms)
  timeout: 10000,
};

const TOKEN_STORAGE_KEY = '@ciba_auth_token';
const USER_STORAGE_KEY = '@ciba_user_info';

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

/**
 * 通用 HTTP 请求方法
 */
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
  let url = path.startsWith('http') ? path : `${API_CONFIG.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  // 处理 GET 查询参数
  if (options.params) {
    const query = Object.entries(options.params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (query) {
      url += (url.includes('?') ? '&' : '?') + query;
    }
  }

  // 获取本地 Token
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { 'token': token, 'Authorization': `Bearer ${token}` } : {}),
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

/**
 * 认证相关 API 集合
 */
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

  // 8. 忘记密码 / 重置密码 (支持手机号或邮箱)
  resetPassword: async (params: {
    account: string; // 手机号或邮箱
    code: string;
    newPassword: string;
  }) => {
    // 调用通用注册/重置逻辑
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
