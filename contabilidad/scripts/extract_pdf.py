import sys
from pypdf import PdfReader

def extract_pdf_to_md(pdf_path, output_path):
    try:
        reader = PdfReader(pdf_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# Reglamento 2026\n\nExtracted from {pdf_path}\n\n")
            for idx, page in enumerate(reader.pages):
                text = page.extract_text()
                f.write(f"## Página {idx + 1}\n\n")
                f.write(text)
                f.write("\n\n---\n\n")
        print(f"Successfully extracted {len(reader.pages)} pages to {output_path}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    extract_pdf_to_md('regralmento/Reglamento 2026.pdf', 'regralmento/Reglamento_2026.md')
