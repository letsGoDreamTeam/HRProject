# /// script
# requires-python = ">=3.10"
# dependencies = [
#      "pymupdf",
# ]
# ///
"""
현재 폴더의 PDF 파일을 모두 TXT로 추출.
우분투 LibreOffice 변환 결과처럼 표 기반 레이아웃도 올바른 순서로 추출.

실행:
    python pdf_to_txt.py
"""

import fitz  # PyMuPDF
import os
import glob


def extract_page_text(page: fitz.Page) -> str:
    """
    블록을 행 단위로 묶어 정렬한 뒤 텍스트 재조립.
    우분투 환경에서 표 셀이 뒤섞이는 문제를 방지.
    """
    blocks = page.get_text("blocks")
    # y좌표를 15px 단위로 묶어 같은 행으로 처리 → x 기준 정렬
    blocks.sort(key=lambda b: (round(b[1] / 15) * 15, b[0]))
    lines = []
    for b in blocks:
        text = b[4].replace("\r\n", "\n").replace("\r", "\n").strip()
        if text:
            lines.append(text)
    return "\n".join(lines)


def batch_extract_pdf_to_txt() -> None:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    pdf_files = glob.glob(os.path.join(current_dir, "*.pdf"))

    if not pdf_files:
        print(f"폴더 내에 PDF 파일이 없습니다: {current_dir}")
        return

    print(f"총 {len(pdf_files)}개의 PDF 파일을 찾았습니다.")

    for pdf_path in sorted(pdf_files):
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        txt_path = os.path.join(current_dir, f"{base_name}.txt")

        try:
            print(f"  추출 중: {base_name}.pdf ...", end=" ", flush=True)
            doc = fitz.open(pdf_path)

            full_text = ""
            for page_num, page in enumerate(doc, start=1):
                full_text += f"\n--- {page_num}페이지 ---\n"
                full_text += extract_page_text(page) + "\n"

            doc.close()

            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(full_text)

            print(f"완료 → {base_name}.txt")

        except Exception as e:
            print(f"오류: {e}")

    print("\n모든 작업이 완료되었습니다.")


if __name__ == "__main__":
    batch_extract_pdf_to_txt()
