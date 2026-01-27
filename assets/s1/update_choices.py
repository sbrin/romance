import json
from pathlib import Path
import sys

DEFAULT_PATH = Path(__file__).resolve().parent / "s1.json"
file_path = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else DEFAULT_PATH

def get_choices_values(n):
    if n == 1:
        return ["Да"]
    elif n == 2:
        return ["Да", "Нет"]
    elif n == 3:
        return ["Да", "Нет", "Не знаю"]
    elif n == 4:
        return ["Да", "Нет", "Не знаю", "Может быть"]
    else:
        # Fallback
        base = ["Да", "Нет", "Не знаю", "Может быть"]
        for i in range(5, n + 1):
            base.append(f"Вариант {i}")
        return base

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

changed = False

for conv_id, nodes in data.items():
    if not isinstance(nodes, list):
        continue
    
    for node in nodes:
        if node.get('type') == 'Text':
            nxt = node.get('next')
            if isinstance(nxt, list) and len(nxt) > 0:
                # User wants to add 'choices' object
                # Key = ID from next
                # Value = Choice string
                
                choice_values = get_choices_values(len(nxt))
                choices_map = {}
                for i, next_id in enumerate(nxt):
                    if i < len(choice_values):
                        choices_map[next_id] = choice_values[i]
                if node.get('choices') != choices_map:
                    node['choices'] = choices_map
                    changed = True

if changed:
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Modified s1.json successfully.")
else:
    print("No changes made.")
