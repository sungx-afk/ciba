export const Colors = {
  primary: '#E8890F', // 琥珀橙
  primaryLight: '#FFF4E5',
  primaryDark: '#C77006',
  
  background: '#FDFAF4', // 米白底
  card: '#FFFFFF',
  
  textPrimary: '#1F1A12', // 深褐黑
  textSecondary: '#6B6051', // 次要说明文字
  textMuted: '#A69E92', // 占位/弱化提示
  
  border: '#EFE8DC',
  divider: '#F5EFE6',
  
  pinwheelGreen: '#7CAE1C',
  pinwheelYellow: '#F4C225',
  pinwheelBlue: '#588CFC',
  pinwheelRed: '#F95452',
  
  success: '#7CAE1C',
  warning: '#F4C225',
  danger: '#F95452',
  info: '#588CFC',
  
  darkCard: '#342A1C',
  gold: '#E9A81B',
};

const PINWHEEL_COLORS = [
  Colors.pinwheelYellow,
  Colors.pinwheelGreen,
  Colors.pinwheelBlue,
  Colors.pinwheelRed,
];

// 根据分类名称推导稳定的识别色（不使用随机 hash）
export function getCategoryColor(categoryName: string): string {
  if (!categoryName) return Colors.primary;
  let sum = 0;
  for (let i = 0; i < categoryName.length; i++) {
    sum += categoryName.charCodeAt(i);
  }
  return PINWHEEL_COLORS[sum % PINWHEEL_COLORS.length];
}
