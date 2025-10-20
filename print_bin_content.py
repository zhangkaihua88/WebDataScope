# -*- coding: utf-8 -*-
import data_processor
import json

def print_bin_data(dataset_name):
    """
    读取并打印指定 .bin 文件的数据结构。
    """
    print(f"--- 正在读取数据集: {dataset_name} ---")
    data = data_processor.read_bin_file(dataset_name)
    
    if data:
        print(f"成功读取并解码文件。包含 {len(data)} 个数据字段。")
        print("\n数据结构预览 (第一个字段):")
        
        # 获取第一个字段的键和值
        first_field_name = next(iter(data))
        first_field_data = data[first_field_name]
        
        print(f"\n字段名: {first_field_name}")
        print("字段内容 (数据结构):")
        
        # 使用 json.dumps 来格式化输出，使其更易读
        # 我们将大的列表截断以保持输出简洁
        formatted_data = {}
        for key, value in first_field_data.items():
            if isinstance(value, list) and len(value) > 10:
                formatted_data[key] = f"(列表，长度 {len(value)}, 前3个元素: {value[:3]})"
            else:
                formatted_data[key] = value

        print(json.dumps(formatted_data, indent=4, ensure_ascii=False))
        
    else:
        print(f"未能读取或解码数据集: {dataset_name}")

if __name__ == '__main__':
    # 获取数据集列表
    dataset_list = data_processor.get_dataset_list()
    
    if dataset_list:
        # 选择第一个 .bin 文件作为示例
        sample_dataset = dataset_list[0]
        print_bin_data(sample_dataset)
    else:
        print("未能找到数据集列表。请确保 data/dataSetList.json 文件存在。")
