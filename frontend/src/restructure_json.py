#!/usr/bin/env python3
"""
fix_and_restructure.py
======================
COMPLETE FIX: Restores original JSON files and restructures them properly.

Run from frontend/src:
    python3 fix_and_restructure.py

This script:
1. Checks if assets/ has corrupted (dict) explanations
2. Checks if assets_backup/ ALSO has corrupted explanations
3. If both corrupted: restores from git (git checkout)
4. If backup is clean: restores from backup
5. Then restructures all files with the fixed parser
"""

import json
import glob
import os
import re
import shutil
import subprocess
import sys


def check_has_string_explanations(directory):
    """Check if JSON files in directory have string (original) explanations."""
    pattern = os.path.join(directory, "**", "*.json")
    files = sorted(glob.glob(pattern, recursive=True))
    files = [f for f in files if "__MACOSX" not in f and ".DS_Store" not in f]
    
    if not files:
        return None  # directory empty or doesn't exist
    
    string_count = 0
    dict_count = 0
    
    for f in files[:20]:  # Check first 20
        try:
            d = json.load(open(f))
            for a in d.get("approaches", []):
                for lad in a.get("ladders", []):
                    exp = lad.get("explanation")
                    if isinstance(exp, str) and len(exp) > 50:
                        string_count += 1
                    elif isinstance(exp, dict):
                        dict_count += 1
        except:
            pass
    
    if string_count > 0 and dict_count == 0:
        return "string"  # Original format
    elif dict_count > 0:
        return "dict"    # Already converted
    return "unknown"


def _split_respecting_parens(text):
    """Split on commas and 'and' but NOT inside parentheses."""
    parts = []
    buf = []
    depth = 0
    i = 0
    while i < len(text):
        c = text[i]
        if c == '(':
            depth += 1
            buf.append(c)
        elif c == ')':
            depth = max(0, depth - 1)
            buf.append(c)
        elif depth == 0 and c == ',':
            chunk = ''.join(buf).strip()
            if chunk:
                chunk = re.sub(r'^(?:and|or)\s+', '', chunk, flags=re.I).strip()
                if chunk and len(chunk) > 3:
                    parts.append(chunk.rstrip('.').rstrip(','))
            buf = []
        elif depth == 0 and i + 5 <= len(text) and text[i:i+5] == ' and ' and text[i:i+7] != ' and/or':
            chunk = ''.join(buf).strip()
            if chunk and len(chunk) > 3:
                parts.append(chunk.rstrip('.').rstrip(','))
            buf = []
            i += 5
            continue
        elif depth == 0 and i + 4 <= len(text) and text[i:i+4] == ' or ' and text[i:i+7] != ' or not':
            chunk = ''.join(buf).strip()
            if chunk and len(chunk) > 3:
                parts.append(chunk.rstrip('.').rstrip(','))
            buf = []
            i += 4
            continue
        else:
            buf.append(c)
        i += 1
    chunk = ''.join(buf).strip()
    if chunk:
        chunk = re.sub(r'^(?:and|or)\s+', '', chunk, flags=re.I).strip()
        if chunk and len(chunk) > 3:
            parts.append(chunk.rstrip('.').rstrip(','))
    return parts if parts else ([text.strip()] if text.strip() else [])


def parse_explanation(text):
    """Parse a raw explanation string into structured sections."""
    if not text or not isinstance(text, str):
        return text

    result = {
        "prose": None, "connectsTo": None, "timeComplexity": None,
        "spaceComplexity": None, "commonMistakes": None, "codePattern": None,
        "algorithm": None, "summary": None,
    }

    blocks = text.split("\n\n")
    main_prose = blocks[0] if blocks else ""
    algo_block = ""
    summary_block = ""

    for i in range(1, len(blocks)):
        b = blocks[i].strip()
        if re.match(r"^(?:Step-by-step algorithm|Algorithm|Steps)\s*:", b, re.I):
            algo_block = b
        elif re.match(r"^(?:Time|Space)\s*(?:complexity)?\s*:", b):
            summary_block += ("\n" if summary_block else "") + b
        elif re.match(r"^(?:Key concepts|Basic (?:array )?concepts)\s*:", b, re.I):
            if not algo_block: algo_block = b
        elif re.match(r"^(?:Example|Note)\s*:", b, re.I):
            pass
        elif re.match(r"^Common mistakes\s*:", b, re.I):
            main_prose += "\n\n" + b
        elif re.match(r"^(?:Connection to|This connects)\s", b, re.I):
            main_prose += "\n\n" + b
        elif re.match(r"^(?:Real )?code pattern\s*:", b, re.I):
            main_prose += "\n\n" + b
        else:
            main_prose += "\n\n" + b

    # connects to Lx
    conn_match = re.search(r"This\s+(?:\w+\s+)?connects?\s+to\s+(L\d)\s*([^.]*)\.", main_prose, re.I)
    if not conn_match:
        conn_match = re.search(r"Connection to\s+(L\d)\s*:\s*([^.]*)\.", main_prose, re.I)
    if not conn_match:
        m = re.search(r"Connection to\s+(?:higher level|level above|the level above)\s*:\s*([^.]*)\.", main_prose, re.I)
        if m:
            result["connectsTo"] = {"level": None, "reason": m.group(1).strip() or None}
            main_prose = main_prose.replace(m.group(0), "")
    if conn_match:
        result["connectsTo"] = {"level": conn_match.group(1), "reason": conn_match.group(2).strip() or None}
        main_prose = main_prose.replace(conn_match.group(0), "")

    # Time complexity
    tm = re.search(r"Time complexity\s*(?:is|of|:)\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\.", main_prose, re.I)
    if not tm: tm = re.search(r"time is\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\.", main_prose, re.I)
    if not tm: tm = re.search(r"(?:with|is|has|gives?|giving)\s+(O\([^)]+\))\s+time(?:\s+complexity)?([^.]*)\.", main_prose, re.I)
    if tm:
        result["timeComplexity"] = {"value": tm.group(1), "note": tm.group(2).strip().lstrip("- ") or None}
        main_prose = main_prose.replace(tm.group(0), "")

    # Space complexity
    sm = re.search(r"Space complexity\s*(?:is|of|:)\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\.", main_prose, re.I)
    if not sm: sm = re.search(r"space is\s*(O\([^)]+\))\s*[-–—]?\s*([^.]*)\.", main_prose, re.I)
    if not sm: sm = re.search(r"(?:with|is|has|gives?|giving|and)\s+(O\([^)]+\))\s+space(?:\s+complexity)?([^.]*)\.", main_prose, re.I)
    if sm:
        result["spaceComplexity"] = {"value": sm.group(1), "note": sm.group(2).strip().lstrip("- ") or None}
        main_prose = main_prose.replace(sm.group(0), "")

    # Common mistakes
    mm = re.search(
        r"Common mistakes\s*(?:include|are)?:?\s*(.*?)(?=\.\s*(?:The )?(?:real )?code pattern|Real code pattern|\.\s*$|$)",
        main_prose, re.I | re.S)
    if mm:
        raw = mm.group(1).strip().rstrip(".")
        newline_items = re.split(r"\n\s*\d+[).]\s*", raw)
        if len(newline_items) > 1:
            first = re.sub(r"^\d+[).]\s*", "", newline_items[0]).strip()
            items = [first] + [s.strip().rstrip(".") for s in newline_items[1:]]
            result["commonMistakes"] = [s for s in items if s and len(s) > 3]
        else:
            numbered = re.split(r"(?:^|\s)\d+[).]\s+", raw)
            numbered = [s.strip().rstrip(",").rstrip(".").strip() for s in numbered if s.strip()]
            if len(numbered) > 1 and all(len(s) > 5 for s in numbered):
                result["commonMistakes"] = [s for s in numbered if len(s) > 3]
            else:
                result["commonMistakes"] = _split_respecting_parens(raw)
        if result["commonMistakes"]:
            result["commonMistakes"] = [m for m in result["commonMistakes"] if len(m) >= 8 and ' ' in m]
            if not result["commonMistakes"]: result["commonMistakes"] = None
        main_prose = main_prose.replace(mm.group(0), "")

    # Code pattern
    cm = re.search(r"(?:The\s+)?(?:real\s+)?code pattern\s*(?:is|involves|:)\s*(.*?)$", main_prose, re.I | re.S)
    if cm:
        ct = cm.group(1).strip().rstrip(".")
        if re.search(r"^(?:def |function |class |for |if |while |#|//)", ct, re.M):
            result["codePattern"] = ct or None
        else:
            fs = re.match(r"([^.]+)", ct)
            result["codePattern"] = (fs.group(1).strip() if fs else ct) or None
        main_prose = main_prose.replace(cm.group(0), "")

    # Inline algorithm
    if not algo_block:
        iam = re.search(
            r"The algorithm:\s*((?:\d+[).]\s*.*?))\s*(?=Time complexity|Space complexity|Common mistakes|This (?:connects|feeds|ensures)|$)",
            main_prose, re.I | re.S)
        if iam:
            at = iam.group(1).strip()
            steps = re.split(r"(?=\d+[).]\s)", at)
            steps = [s.strip().rstrip(".").strip() for s in steps if s.strip() and re.match(r"\d+[).]", s.strip())]
            if len(steps) >= 2:
                result["algorithm"] = steps
                main_prose = main_prose.replace(iam.group(0), "")
                main_prose = re.sub(r"The algorithm:\s*", "", main_prose, flags=re.I)

    # Clean prose
    main_prose = re.sub(r"\.\s*\.", ".", main_prose)
    main_prose = re.sub(r"\s{2,}", " ", main_prose).strip().rstrip(".")
    if main_prose: main_prose += "."
    result["prose"] = main_prose if main_prose and main_prose != "." else None

    # Algorithm block
    if algo_block:
        lines = [l for l in algo_block.split("\n")[1:] if l.strip()]
        if lines: result["algorithm"] = lines

    # Summary block
    if summary_block:
        summary = {}
        t = re.search(r"Time(?:\s+complexity)?\s*:\s*(O\([^)]+\))\s*[-–—]\s*(.*)", summary_block, re.I)
        s = re.search(r"Space(?:\s+complexity)?\s*:\s*(O\([^)]+\))\s*[-–—]\s*(.*)", summary_block, re.I)
        if t: summary["time"] = {"value": t.group(1), "note": t.group(2).strip().rstrip(".")}
        if s: summary["space"] = {"value": s.group(1), "note": s.group(2).strip().rstrip(".")}
        if summary: result["summary"] = summary

    if not result["algorithm"]: result["algorithm"] = None
    if not result["commonMistakes"]: result["commonMistakes"] = None
    return result


def process_file(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    modified = False
    for approach in data.get("approaches", []):
        for ladder in approach.get("ladders", []):
            exp = ladder.get("explanation")
            if not exp or not isinstance(exp, str): continue
            ladder["explanation"] = parse_explanation(exp)
            modified = True
    if modified:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    return modified


def main():
    # Find base directory
    if os.path.isdir("assets"):
        base = "."
    elif os.path.isdir("src/assets"):
        base = "src"
    else:
        print("ERROR: Cannot find assets/ directory.")
        print("Run from frontend/ or frontend/src/")
        sys.exit(1)

    assets_dir = os.path.join(base, "assets")
    backup_dir = os.path.join(base, "assets_backup")

    # ── STEP 1: Diagnose the state ──
    assets_state = check_has_string_explanations(assets_dir)
    backup_state = check_has_string_explanations(backup_dir) if os.path.exists(backup_dir) else None

    print(f"  assets/        → {assets_state or 'missing'}")
    print(f"  assets_backup/ → {backup_state or 'missing'}")
    print()

    if assets_state == "string":
        print("✓ Assets have original string explanations. Processing directly.")
    elif backup_state == "string":
        print("⚠ Assets already converted. Restoring from backup...")
        shutil.rmtree(assets_dir)
        shutil.copytree(backup_dir, assets_dir)
        print("  ✓ Restored from assets_backup/")
    elif assets_state == "dict" and backup_state == "dict":
        print("✗ BOTH assets/ and assets_backup/ have been converted already.")
        print("  The backup is corrupted. Attempting git restore...")
        print()
        
        # Try git checkout
        git_root = base if base == "." else os.path.dirname(base)
        try:
            result = subprocess.run(
                ["git", "checkout", "HEAD", "--", assets_dir],
                capture_output=True, text=True, cwd=git_root if git_root else "."
            )
            if result.returncode == 0:
                print("  ✓ Restored from git!")
                # Remove corrupted backup too
                if os.path.exists(backup_dir):
                    shutil.rmtree(backup_dir)
            else:
                print(f"  Git restore failed: {result.stderr.strip()}")
                print()
                print("  MANUAL FIX NEEDED:")
                print("  1. Delete assets_backup/  folder")
                print("  2. Restore assets/ from your original source (git, zip, etc)")
                print("     e.g.: git checkout HEAD -- assets/")
                print("  3. Run this script again")
                sys.exit(1)
        except FileNotFoundError:
            print("  Git not available.")
            print()
            print("  MANUAL FIX NEEDED:")
            print("  1. Delete assets_backup/  folder")  
            print("  2. Restore assets/ from your original source (zip, git, etc)")
            print("  3. Run this script again")
            sys.exit(1)
    else:
        print(f"Unknown state. Proceeding anyway...")

    # Verify we now have strings
    verify = check_has_string_explanations(assets_dir)
    if verify != "string":
        print(f"\n✗ After restore, assets still have '{verify}' format.")
        print("  Please manually restore assets/ from your original source and retry.")
        sys.exit(1)

    # ── STEP 2: Create clean backup ──
    if os.path.exists(backup_dir):
        bk_state = check_has_string_explanations(backup_dir)
        if bk_state != "string":
            print("  Removing corrupted backup...")
            shutil.rmtree(backup_dir)

    if not os.path.exists(backup_dir):
        print(f"  Creating fresh backup at {backup_dir}/")
        shutil.copytree(assets_dir, backup_dir)

    # ── STEP 3: Process all files ──
    pattern = os.path.join(assets_dir, "**", "*.json")
    files = sorted(glob.glob(pattern, recursive=True))
    files = [f for f in files if "__MACOSX" not in f and ".DS_Store" not in f]

    print(f"\nProcessing {len(files)} JSON files...")

    processed = 0
    errors = 0
    total_ladders = 0

    for filepath in files:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            has_str = any(
                isinstance(lad.get("explanation"), str)
                for a in data.get("approaches", [])
                for lad in a.get("ladders", [])
            )
            for a in data.get("approaches", []):
                total_ladders += len(a.get("ladders", []))
            
            if has_str and process_file(filepath):
                processed += 1
        except Exception as e:
            errors += 1
            print(f"  ✗ {filepath}: {e}")

    print(f"\n  Processed: {processed} files")
    print(f"  Errors:    {errors}")
    print(f"  Ladders:   {total_ladders}")

    if processed > 0:
        print(f"\n✅ Done! All JSON files restructured successfully.")
        print(f"   Clean backup at {backup_dir}/")
    elif errors == 0:
        print("\n⚠ No files needed processing.")
    else:
        print("\n✗ Errors occurred. Check output above.")


if __name__ == "__main__":
    main()