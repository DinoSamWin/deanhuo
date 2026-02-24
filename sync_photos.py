import os
import json
import time

# 配置路径
PHOTOS_DIR = 'assets/images/photos'
DATA_FILE = 'assets/data/photos.json'
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}

def sync_photos():
    # 1. 读取现有的配置，以便保留手动设置（如 showOnHome, title, description）
    existing_data = {}
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                old_list = json.load(f)
                # 使用 src 作为 key 来匹配
                existing_data = {item['src']: item for item in old_list}
        except Exception as e:
            print(f"读取旧 JSON 失败: {e}")

    # 2. 扫描文件夹
    new_photos = []
    if not os.path.exists(PHOTOS_DIR):
        print(f"错误: 找不到目录 {PHOTOS_DIR}")
        return

    for filename in os.listdir(PHOTOS_DIR):
        ext = os.path.splitext(filename)[1].lower()
        if ext in ALLOWED_EXTENSIONS:
            file_path = os.path.join(PHOTOS_DIR, filename)
            # 获取更新时间
            mtime = os.path.getmtime(file_path)
            
            # 如果是已知照片，保留旧数据
            if file_path in existing_data:
                item = existing_data[file_path]
                item['updateTime'] = mtime
            else:
                # 如果是新照片，创建默认条目
                item = {
                    "id": os.path.splitext(filename)[0],
                    "title": os.path.splitext(filename)[0].replace('-', ' ').title(),
                    "description": "",
                    "src": file_path,
                    "showOnHome": False,
                    "category": "Photography",
                    "date": time.strftime('%b %Y', time.localtime(mtime)),
                    "updateTime": mtime
                }
            new_photos.append(item)

    # 3. 按照更新时间排序 (从新到旧)
    new_photos.sort(key=lambda x: x.get('updateTime', 0), reverse=True)

    # 4. 写入文件
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(new_photos, f, indent=4, ensure_ascii=False)
        print(f"同步成功！共处理 {len(new_photos)} 张照片。")
        print(f"数据已更新至: {DATA_FILE}")
    except Exception as e:
        print(f"保存 JSON 失败: {e}")

if __name__ == '__main__':
    sync_photos()
