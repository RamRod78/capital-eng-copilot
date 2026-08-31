
import os
import base64
import sys

TARGET_DIRS = [
    r'c:\Users\iain\git\capital-eng-copilot\test_documents\banana_packaging_suite',
    r'g:\My Drive\02 - Antigravity Projects\capital-engineering-copilot\test_documents\banana_packaging_suite'
]

def save_doc(filename, b64_content):
    content = base64.b64decode(b64_content).decode('utf-8')
    for d in TARGET_DIRS:
        try:
            os.makedirs(d, exist_ok=True)
            fpath = os.path.join(d, filename)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(content.strip() + '\n')
            print(f'Wrote: {filename} to {d}')
        except Exception as e:
            print(f'Error writing {filename} to {d}: {e}')

if __name__ == '__main__':
    if len(sys.argv) == 3:
        save_doc(sys.argv[1], sys.argv[2])
