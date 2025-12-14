import json
import math
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_XLSX = ROOT / "data" / "words.xlsx"
DATA_CSV  = ROOT / "data" / "words.csv"   # 任意（xlsxが無い場合の逃げ）
OUT_JSON  = ROOT / "words.json"


# 列名のゆらぎを吸収するマッピング
COL_CANDIDATES = {
    "word": ["单词", "単語", "word", "Word", "WORD"],
    "pos": ["词性", "品詞", "pos", "POS"],
    "phonetic": ["音标", "phonetic", "Phonetic"],
    "meaning": ["词义", "意味", "meaning", "Meaning"],
    "example": ["例句", "例文", "example", "Example"],
    "position": ["单词量", "単語量", "单词量位置", "位置", "position", "Position"],
}


def pick_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def clean_number(x):
    if x is None:
        return None
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    try:
        # "123.0" / "123" / 123 などを int 化
        v = float(x)
        if math.isnan(v) or math.isinf(v):
            return None
        iv = int(v)
        return iv
    except Exception:
        return None


def main():
    if DATA_XLSX.exists():
        df = pd.read_excel(DATA_XLSX, engine="openpyxl")
    elif DATA_CSV.exists():
        df = pd.read_csv(DATA_CSV)
    else:
        raise FileNotFoundError("data/words.xlsx（または data/words.csv）が見つかりません。")

    # 必要列を抽出
    col_word = pick_column(df, COL_CANDIDATES["word"])
    if col_word is None:
        raise ValueError("単語列（単語/word）が見つかりません。Excelのヘッダを確認してください。")

    col_pos = pick_column(df, COL_CANDIDATES["pos"])
    col_pho = pick_column(df, COL_CANDIDATES["phonetic"])
    col_mean = pick_column(df, COL_CANDIDATES["meaning"])
    col_ex = pick_column(df, COL_CANDIDATES["example"])
    col_posi = pick_column(df, COL_CANDIDATES["position"])

    records = []
    for _, row in df.iterrows():
        word = str(row[col_word]).strip() if row.get(col_word) is not None else ""
        if not word or word.lower() == "nan":
            continue

        rec = {
            "word": word,
            "pos": "" if col_pos is None else str(row.get(col_pos, "")).strip(),
            "phonetic": "" if col_pho is None else str(row.get(col_pho, "")).strip(),
            "meaning": "" if col_mean is None else str(row.get(col_mean, "")).strip(),
            "example": "" if col_ex is None else str(row.get(col_ex, "")).strip(),
            "position": None if col_posi is None else clean_number(row.get(col_posi, None)),
        }
        records.append(rec)

    # wordで重複がある場合、後勝ちにする（最後の行を採用）
    # （必要なら "word|pos" にするなど拡張可能）
    dedup = {}
    for r in records:
        dedup[r["word"]] = r
    records = list(dedup.values())

    # positionがあるものは position順 → なければ word順
    records.sort(key=lambda r: (r["position"] is None, r["position"] if r["position"] is not None else 10**18, r["word"].lower()))

    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(records)} words)")


if __name__ == "__main__":
    main()
