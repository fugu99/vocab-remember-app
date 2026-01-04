import json
import math
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_XLSX = ROOT / "data" / "words.xlsx"
DATA_CSV  = ROOT / "data" / "words.csv"   # 任意（xlsxが無い場合）
OUT_JSON  = ROOT / "words.json"

# 既知の列名揺れ（今回の新ヘッダもここに追加）
COL_CANDIDATES = {
    "word": ["单词", "單詞", "単語", "word", "Word", "WORD"],
    "pos": ["词性", "詞性", "品詞", "pos", "POS"],
    "phonetic": ["音标", "音標", "phonetic", "Phonetic"],
    "meaning": ["词义", "詞義", "意味", "meaning", "Meaning"],
    "example": ["例句或情景", "例句", "例文", "example", "Example"],
    "collocation": ["常见搭配", "常用搭配", "搭配", "collocation", "Collocation"],
    "roots": ["词根词缀,词词尾", "词根词缀", "詞根詞綴", "词根词缀/词尾", "词根词缀・词尾", "roots", "Roots"],
    "inflection": ["单词变形", "變形", "活用", "inflection", "Inflection"],
    "related": ["相关词", "相關詞", "関連語", "related", "Related"],
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

def is_blank(x) -> bool:
    if x is None:
        return True
    if isinstance(x, float) and math.isnan(x):
        return True
    s = str(x).strip()
    return (s == "" or s.lower() == "nan")

def read_excel_with_header_guess(path: Path) -> pd.DataFrame:
    # header 行ズレ対策：0,1,2行目を試す
    last_err = None
    for hdr in [0, 1, 2]:
        try:
            df = pd.read_excel(path, engine="openpyxl", header=hdr)
            df.columns = [str(c).strip() for c in df.columns]
            if pick_column(df, COL_CANDIDATES["word"]) is not None:
                return df
        except Exception as e:
            last_err = e
    raise ValueError(
        "Excelのヘッダ行を特定できませんでした（0〜2行目を試行）。"
        "最上段付近に『单词/単語/word』があるか確認してください。"
    ) from last_err

def main():
    if DATA_XLSX.exists():
        df = read_excel_with_header_guess(DATA_XLSX)
    elif DATA_CSV.exists():
        df = pd.read_csv(DATA_CSV)
        df.columns = [str(c).strip() for c in df.columns]
    else:
        raise FileNotFoundError("data/words.xlsx（または data/words.csv）が見つかりません。")

    df.columns = [str(c).strip() for c in df.columns]

    c_word = pick_column(df, COL_CANDIDATES["word"])
    if c_word is None:
        raise ValueError("単語列（单词/単語/word）が見つかりません。Excelのヘッダを確認してください。")

    c_pos        = pick_column(df, COL_CANDIDATES["pos"])
    c_phonetic   = pick_column(df, COL_CANDIDATES["phonetic"])
    c_meaning    = pick_column(df, COL_CANDIDATES["meaning"])
    c_example    = pick_column(df, COL_CANDIDATES["example"])
    c_colloc     = pick_column(df, COL_CANDIDATES["collocation"])
    c_roots      = pick_column(df, COL_CANDIDATES["roots"])
    c_inflect    = pick_column(df, COL_CANDIDATES["inflection"])
    c_related    = pick_column(df, COL_CANDIDATES["related"])
    c_position   = pick_column(df, COL_CANDIDATES["position"])

    known_cols = {c for c in [c_word, c_pos, c_phonetic, c_meaning, c_example, c_colloc, c_roots, c_inflect, c_related, c_position] if c is not None}

    records = []
    for _, row in df.iterrows():
        word = str(row.get(c_word, "")).strip()
        if not word or word.lower() == "nan":
            continue

        rec = {
            "word": word,
            "pos": "" if c_pos is None else str(row.get(c_pos, "")).strip(),
            "phonetic": "" if c_phonetic is None else str(row.get(c_phonetic, "")).strip(),
            "meaning": "" if c_meaning is None else str(row.get(c_meaning, "")).strip(),
            "example": "" if c_example is None else str(row.get(c_example, "")).strip(),

            # ★新ヘッダ対応（専用フィールド化）
            "collocation": "" if c_colloc is None else str(row.get(c_colloc, "")).strip(),
            "roots": "" if c_roots is None else str(row.get(c_roots, "")).strip(),
            "inflection": "" if c_inflect is None else str(row.get(c_inflect, "")).strip(),
            "related": "" if c_related is None else str(row.get(c_related, "")).strip(),

            "position": None if c_position is None else clean_number(row.get(c_position, None)),

            # 将来の列追加に備えて extra も残す（既知列以外はここへ）
            "extra": {}
        }

        for col in df.columns:
            if col in known_cols:
                continue
            v = row.get(col, None)
            if is_blank(v):
                continue
            rec["extra"][str(col).strip()] = str(v).strip()

        records.append(rec)

    # word重複は後勝ち（Excelで後の行を優先）
    dedup = {}
    for r in records:
        dedup[r["word"]] = r
    records = list(dedup.values())

    # positionがあるものは position順 → ないものは最後 → word順
    records.sort(key=lambda r: (r["position"] is None, r["position"] if r["position"] is not None else 10**18, r["word"].lower()))

    OUT_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(records)} words)")

if __name__ == "__main__":
    main()
