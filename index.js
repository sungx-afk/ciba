// 第一行立即导入全局防闪退守护与黑匣子日志
import './src/utils/crashGuard';
import { addBootLog } from './src/utils/crashGuard';

import { registerRootComponent } from 'expo';
import App from './App';

addBootLog('Entry', 'index.js 开始注册根组件 App');
registerRootComponent(App);
addBootLog('Entry', 'registerRootComponent 执行完毕');
