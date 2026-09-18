// components/ActionSheet.tsx
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

/**
 * 底部动作菜单（对应 web / 小程序的 ActionSheet）：
 * 卡片右上角设置、列表长按等操作统一走这里，样式为白底圆角面板 + 分隔线 + 底部「取消」。
 */
export interface ActionSheetItem {
  key: string;
  name: string;
  /** 危险操作（删除等）用红色文字，默认与其它项一致 */
  danger?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  items: ActionSheetItem[];
  onSelect: (key: string) => void;
  onClose: () => void;
  /** 取消项文案，默认「取消」 */
  cancelText?: string;
}

export const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  items,
  onSelect,
  onClose,
  cancelText = '取消',
}) => {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.mask} activeOpacity={1} onPress={onClose} />

        <View style={styles.group}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.item, index > 0 && styles.itemDivider]}
              activeOpacity={0.7}
              onPress={() => onSelect(item.key)}
            >
              <Text style={[styles.itemText, item.danger && styles.itemTextDanger]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.group, styles.cancelGroup]} activeOpacity={0.7} onPress={onClose}>
          <Text style={styles.itemText}>{cancelText}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  group: {
    marginHorizontal: 8,
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cancelGroup: {
    marginTop: 8,
    marginBottom: 10,
  },
  item: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  itemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  itemTextDanger: {
    color: Colors.danger,
  },
});
