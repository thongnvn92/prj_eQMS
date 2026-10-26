// Form sắp xếp thứ tự công việc gốc (nút lên/xuống trên danh sách).
import { useCallback, useEffect, useState } from 'react';
import { Button, List, Space, Typography, Modal } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

export interface ReorderTaskModalProps {
  open: boolean;
  orderIds: number[];
  onCancel: () => void;
  onOk: (orderedIds: number[]) => void;
}

export default function ReorderTaskModal({ open, orderIds, onCancel, onOk }: ReorderTaskModalProps) {
  const [ids, setIds] = useState<number[]>(orderIds.slice());

  useEffect(() => {
    if (open) {
      setIds(orderIds.slice());
    }
  }, [open, orderIds]);

  const move = useCallback((from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setIds(next);
  }, [ids]);

  return (
    <Modal
      open={open}
      title="Sắp xếp thứ tự các mục gốc"
      onCancel={onCancel}
      onOk={() => onOk(ids)}
      okText="Lưu thứ tự"
      cancelText="Hủy"
      destroyOnHidden
    >
      <List
        dataSource={ids}
        renderItem={(id, index) => (
          <List.Item>
            <Space size={8}>
              <Button
                type="text"
                icon={<ArrowUpOutlined />}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              />
              <Button
                type="text"
                icon={<ArrowDownOutlined />}
                disabled={index === ids.length - 1}
                onClick={() => move(index, index + 1)}
              />
              <Typography.Text code>{id}</Typography.Text>
            </Space>
          </List.Item>
        )}
      />
    </Modal>
  );
}
