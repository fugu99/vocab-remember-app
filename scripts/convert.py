import json
import math
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_XLSX = ROOT / "data" / "words.xlsx"
DATA_CSV  = ROOT / "data" / "words.csv"   # 任意（xlsxが無い場合）
OUT_JSON  = ROOT / "words.json"

COL_CANDIDATES = {
    # 単語列：中/日/英を許容
    "word": ["单词", "單詞", "単語", "word", "Word", "WORD"],
    "pos": ["词性", "詞性", "品詞", "pos", "POS"],
    "phonetic": ["音标", "音標", "phonetic", "Phonetic"],
    "meaning": ["词义", "詞義", "意味", "meaning", "Meaning"],
    "example": ["例句", "例文", "example", "Example"],
    # 単語量（位置）
    "position": ["单词量", "單詞量", "単語量", "单词量位置", "位置", "position", "Position"],
}

def pick_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    cols = {str(c).strip(): c for c in df.columns}
    for name in candidates:
        if name in cols:
            return cols[name]
    return None

def clean_number(x):
    if x is None:
        return None
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    try:
        v = float(x)
        if math.isnan(v) or math.isinf(v):
            return None
        return int(v)
    except Exception:
        return None

def read_excel_with_header_guess(path: Path) -> pd.DataFrame:
    # header 行がズレていても拾えるように 0,1,2 行目を試す
    last_err = None
    for hdr in [0, 1, 2]:
        try:
            df = pd.read_excel(path, engine="openpyxl", header=hdr)
            df.columns = [str(c).strip() for c in df.columns]
            if pick_column(df, COL_CANDIDATES["word"]) is not None:
                return df
        except Exception as e:
            last_err = e
    raise ValueError("Excelのヘッダ行を特定できませんでした（0〜2行目を試行）。最上段付近に『单词/単語/word』があるか確認してください。") from last_err

def main():
    if DATA_XLSX.exists():
        df = read_excel_with_header_guess(DATA_XLSX)
    elif DATA_CSV.exists():
        df = pd.read_csv(DATA_CSV)
        df.columns = [str(c).strip() for c in df.columns]
    else:
        raise FileNotFoundError("data/words.xlsx（または data/words.csv）が見つかりません。")

    col_word = pick_column(df, COL_CANDIDATES["word"])
    if col_word is None:
        raise ValueError("単語列（单词/単語/word）が見つかりません。Excelのヘッダを確認してください。")

    col_pos   = pick_column(df, COL_CANDIDATES["pos"])
    col_pho   = pick_column(df, COL_CANDIDATES["phonetic"])
    col_mean  = pick_column(df, COL_CANDIDATES["meaning"])
    col_ex    = pick_column(df, COL_CANDIDATES["example"])
    col_posi  = pick_column(df, COL_CANDIDATES["position"])

    records = []
    for _, row in df.iterrows():
        word = str(row.get(col_word, "")).strip()
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

    # word 重複は後勝ち（Excelで後の行を優先）
    dedup = {}
    for r in records:
        dedup[r["word"]] = r
    records = list(dedup.values())

    # position があるものは position順 → ないものは最後 → word順
    records.sort(key=lambda r: (r["position"] is None, r["position"] if r["position"] is not None else 10**18, r["word"].lower()))

    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(records)} words)")

if __name__ == "__main__":
    main()
