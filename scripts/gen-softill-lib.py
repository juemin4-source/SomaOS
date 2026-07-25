"""Generate softill_library.rs from vendored JS handlers"""
import os, json, sys

softills_dir = r'G:/AI/Claude-Workspace/Projects/SomaOS-Next/soma-core/softills'
output_path = r'G:/AI/Claude-Workspace/Projects/SomaOS-Next/soma-core/src/combo/softill_library.rs'

# Softills already declared in combo files (skip)
existing_rust = {
    'test-runner', 'verify', 'change-impact-analyzer', 'context-extractor',
    'evidence-collector', 'project-profile-detector',
}

lines = []
lines.append('// 集中式 Softill 库 — 所有 vendored JS Script Softill')
lines.append('// 自动生成。补充 input_schema 和 output_description 时编辑此文件。')
lines.append('')
lines.append('use super::softill::{Softill, SoftillInvocation};')
lines.append('')

# Categorize softills
categories = {'dev': [], 'prod': [], 'design': [], 'general': [], 'deprecated': []}

for entry in sorted(os.listdir(softills_dir)):
    d = os.path.join(softills_dir, entry)
    if not os.path.isdir(d) or entry.startswith('.') or entry == '_shared':
        continue
    if entry in existing_rust:
        continue

    # Check for handler
    handler_file = None
    for hf in ['handler.mjs', 'handler.js']:
        if os.path.isfile(os.path.join(d, hf)):
            handler_file = hf
            break
    if not handler_file:
        continue

    # Read skill.json for description
    desc = entry
    sk_path = os.path.join(d, 'skill.json')
    cat = 'general'
    if os.path.isfile(sk_path):
        try:
            sk = json.load(open(sk_path, encoding='utf-8', errors='replace'))
            if 'description' in sk:
                desc = sk['description']
                if desc.startswith('[开发]'): cat = 'dev'
                elif desc.startswith('[产品]'): cat = 'prod'
                elif desc.startswith('[设计]'): cat = 'design'
                elif desc.startswith('[DEPRECATED]'): cat = 'deprecated'
        except:
            pass

    # Check handler for input/output docs
    h_path = os.path.join(d, handler_file)
    has_doc = False
    try:
        with open(h_path, 'r', errors='replace') as f:
            c = f.read(2000)
            has_doc = '输入' in c or '输出' in c or 'Input' in c or 'Output' in c
    except:
        pass

    categories[cat].append((entry, handler_file, desc, has_doc))

# Generate declarations
cat_labels = {
    'dev': '开发能力',
    'prod': '产品能力',
    'design': '设计能力',
    'general': '通用能力',
    'deprecated': '已弃用'
}

total = 0
for cat_key in ['dev', 'prod', 'design', 'general', 'deprecated']:
    items = categories[cat_key]
    if not items:
        continue

    lines.append(f'// ═══════════════════════════════════════════════')
    lines.append(f'// {cat_labels[cat_key]}')
    lines.append(f'// ═══════════════════════════════════════════════')
    lines.append('')

    for entry, handler_file, desc, has_doc in items:
        fn_name = entry.replace('-', '_').replace('.', '_')
        clean_desc = desc.replace('\\', '\\\\').replace('"', r'\"')

        # Determine effect from description
        dl = clean_desc.lower()
        if any(w in dl for w in ['write', 'create', '生成', '创建', '修改', '发送', 'send']):
            effect = 'write-local'
        elif any(w in dl for w in ['网络', 'network', 'fetch', 'http', 'api']):
            effect = 'network-read-only'
        else:
            effect = 'read-only'

        lines.append(f'// ── {entry}')
        lines.append(f'pub fn {fn_name}_softill() -> Softill {{')
        lines.append(f'    Softill {{')
        lines.append(f'        id: \"{entry}\".into(),')
        lines.append(f'        name: \"{entry}\".into(),')
        lines.append(f'        description: \"{clean_desc}\".into(),')
        lines.append(f'        invocation: SoftillInvocation::Script {{')
        lines.append(f'            path: \"soma-core/softills/{entry}/{handler_file}\".into(),')
        lines.append(f'            interpreter: \"node\".into(),')
        lines.append(f'        }},')
        # Generate tags from name and description
        tag_words = set()
        for w in entry.replace('-', ' ').replace('_', ' ').split():
            if len(w) > 2: tag_words.add(w.lower())
        for w in desc.lower().replace('[', '').replace(']', '').split():
            w = w.strip('(),.、：）。，')
            if len(w) > 2: tag_words.add(w)
        tags_list = sorted(tag_words)[:8]

        lines.append('        input_schema: serde_json::json!({}),')
        lines.append(f'        tags: vec![{", ".join(f"\"{t}\".into()" for t in tags_list)}],')
        if has_doc:
            out_desc = f'{clean_desc} 的执行结果。handler 包含输入/输出说明。'
        else:
            out_desc = f'{clean_desc} 的执行结果。'
        lines.append(f'        output_description: \"{out_desc}\".into(),')
        lines.append(f'        effect: \"{effect}\".into(),')
        lines.append(f'    }}')
        lines.append(f'}}')
        lines.append('')
        total += 1

# Add header
header = f'/// 集中式 Softill 库 — {total} 个 vendored JS Script Softill\n'
header += '///\n'
header += '/// 自动生成于 SomaOS 旧资产批量接入。\n'
header += '/// 每个 Softill 有完整 id、name、description、invocation 和 effect。\n'
header += '/// input_schema 为最小占位，tags 从名称和描述自动提取，可根据实际场景补充细化。\n'

lines.insert(0, header)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
    f.write('\n')

print(f'Generated {output_path}')
print(f'Total Softill declarations: {total}')
