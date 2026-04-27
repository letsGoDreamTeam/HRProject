# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
LibreOffice를 이용해 현재 폴더의 변환 가능한 파일을 모두 PDF로 변환.
지원 포맷: .docx / .doc / .hwp / .pptx / .xlsx

우분투 설치:
    sudo apt install libreoffice

실행:
    python docxtopdf.py
"""

import subprocess
import os
import glob
import sys

SUPPORTED_EXT = (".docx", ".doc", ".hwp", ".pptx", ".xlsx")


def convert_to_pdf(file_path: str, out_dir: str) -> bool:
    """단일 파일을 LibreOffice로 PDF 변환. 성공 시 True 반환."""
    command = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        "--outdir", out_dir,
        file_path,
    ]
    try:
        result = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,          # 파일당 최대 2분
        )
        return True
    except subprocess.TimeoutExpired:
        print(f"  [TIMEOUT] {os.path.basename(file_path)}")
        return False
    except subprocess.CalledProcessError as e:
        print(f"  [ERROR]   {os.path.basename(file_path)}: {e.stderr.strip()}")
        return False


def batch_convert(target_dir: str | None = None) -> None:
    base_dir = target_dir or os.path.dirname(os.path.abspath(__file__))

    # LibreOffice 설치 확인
    try:
        subprocess.run(
            ["libreoffice", "--version"],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("LibreOffice가 설치되어 있지 않습니다.")
        print("우분투: sudo apt install libreoffice")
        sys.exit(1)

    # 변환 대상 파일 수집
    target_files: list[str] = []
    for ext in SUPPORTED_EXT:
        target_files.extend(glob.glob(os.path.join(base_dir, f"*{ext}")))

    if not target_files:
        print(f"변환할 파일이 없습니다: {base_dir}")
        return

    print(f"총 {len(target_files)}개 파일 PDF 변환 시작 → {base_dir}")
    ok, fail = 0, 0

    for f in sorted(target_files):
        name = os.path.basename(f)
        pdf_path = os.path.join(base_dir, os.path.splitext(name)[0] + ".pdf")

        # 이미 변환된 PDF가 있으면 스킵
        if os.path.exists(pdf_path):
            print(f"  [SKIP]    {name}  (PDF 이미 존재)")
            ok += 1
            continue

        print(f"  변환 중: {name} ...", end=" ", flush=True)
        if convert_to_pdf(f, base_dir):
            print("완료")
            ok += 1
        else:
            fail += 1

    print(f"\n완료: {ok}개 성공 / {fail}개 실패")


if __name__ == "__main__":
    # 인자로 폴더 경로를 넘길 수도 있음: python docxtopdf.py /path/to/folder
    folder = sys.argv[1] if len(sys.argv) > 1 else None
    batch_convert(folder)
