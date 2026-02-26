import re

with open('src/domains/logs/components/AnalysisPanel.vue', 'r', encoding='utf-8') as f:
    content = f.read()

# Find template section
template_match = re.search(r'<template>(.*)</template>', content, re.DOTALL)
if template_match:
    template_content = template_match.group(1)
    
    # Find detail-panel section
    detail_match = re.search(r'<div class="detail-panel">.*?</div>\s*</div>\s*<!-- AI 设置 Modal -->', template_content, re.DOTALL)
    if detail_match:
        print("Found detail-panel section ending:")
        print(detail_match.group())
        
    # Find end of template (around AISettingsModal)
    ai_idx = template_content.find('AISettingsModal')
    before_ai = template_content[max(0, ai_idx-200):ai_idx]
    print("\n\n200 chars before AISettingsModal:")
    print(before_ai)
