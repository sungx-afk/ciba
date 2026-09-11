import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 糍粑英语后端 API 客户端
 *
 * 后端响应统一格式: { result: 0, msg: "成功！", ...业务字段 }
 *  - result === 0       成功
 *  - result === -10001  token 失效 / 未登录
 *  - 其它非 0 值        业务错误
 *
 * 全局 query 参数: plat=ios, app_id=ciba_ios_app, token(登录后)
 */

const BASE_URL = 'https://cibaen.com/api';
const APP_ID = 'ciba_ios_app';
const PLAT = 'ios';

const TOKEN_KEY = '@ciba_token';

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
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
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
  // 手动编码，避免依赖 RN 运行时对 URLSearchParams 的实现差异
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

/**
 * 请求体编码方式:
 *  - json: 后端多数 POST/PATCH 接口要求 application/json (Tomcat 对
 *    x-www-form-urlencoded 直接返回 415)。前端 axios 传纯对象时也会
 *    被自动序列化为 JSON，故默认用 JSON。
 *  - form: 个别接口 (install.json / learn/log.json) 前端用 qs.stringify
 *    显式以 form-urlencoded 提交，这些接口单独使用 postForm。
 */
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
  /** 默认 application/json (与前端 axios 传对象的行为一致) */
  post: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('POST', path, { body, encoding: 'json' }),
  patch: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('PATCH', path, { body, encoding: 'json' }),
  /** application/x-www-form-urlencoded，仅用于前端用 qs.stringify 提交的接口 */
  postForm: <T = any>(path: string, body?: Record<string, any>) =>
    request<T>('POST', path, { body, encoding: 'form' }),
  del: <T = any>(path: string) =>
    request<T>('DELETE', path),
};
