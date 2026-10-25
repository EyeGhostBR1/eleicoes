#!/usr/bin/env python3
"""
Gera a base histórica (eleições presidenciais 2018 e 2022) a partir dos dados
abertos do TSE (https://dadosabertos.tse.jus.br / cdn.tse.jus.br/estatistica/sead/odsele).

Saídas (formato em src/lib/types.ts):
  public/data/hist/br.json          -> HistBrFile  ({ br, ufs })
  public/data/hist/mun/{uf}.json    -> HistMunFile (chave = código TSE 5 dígitos)
  public/data/municipios.json       -> MunicipioTuple[] (municípios da eleição 2026)

Uso (Python 3, apenas stdlib):
  python scripts/hist/build_hist.py [--cache-dir DIR] [--refresh] [--cm ARQUIVO]

  --cache-dir  onde baixar/ler os .zip do TSE (padrão: $HIST_CACHE_DIR ou
               <tmp>/apuracao-2026-tse-cache). Downloads são pulados se o zip já existe.
  --refresh    força novo download dos zips.
  --cm         config de municípios 2026 do TSE (mun-e006257-cm.json).

Fontes:
  votacao_candidato_munzona_{ano}.zip -> *_BR.csv (cargo Presidente, todas as UFs + ZZ)
  detalhe_votacao_munzona_{ano}.zip   -> *_BR.csv (aptos, comparecimento, brancos, nulos...)

Regras:
  - CD_CARGO == 1 (Presidente); soma das zonas por (ano, turno, UF, município).
  - vv  = soma de QT_VOTOS_NOMINAIS_VALIDOS de todos os candidatos (exclui anulados/sub judice).
  - pt  = NR_CANDIDATO 13 (Haddad 2018 / Lula 2022)
  - bo  = NR_CANDIDATO 17 em 2018 / 22 em 2022 (Jair Bolsonaro)
  - ap/comp/abst/vb = QT_APTOS / QT_COMPARECIMENTO / QT_ABSTENCOES / QT_VOTOS_BRANCOS
  - vn  = QT_TOTAL_VOTOS_NULOS (nulos + nulos técnicos, total que o TSE divulga).
    Obs.: 2018 1º turno tem 746 votos "anulados e apurados em separado"
    (QT_VOTOS_ANULADOS_APU_SEP), que não entram em vv/vb/vn.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
ODSELE = "https://cdn.tse.jus.br/estatistica/sead/odsele"
ANOS = ("2018", "2022")
NUM_PT = {"2018": "13", "2022": "13"}
NUM_BO = {"2018": "17", "2022": "22"}
FIELDS = ("ap", "comp", "abst", "vv", "vb", "vn", "pt", "bo")

UFS = [
    "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa",
    "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to", "zz",
]

# Totais nacionais oficiais (TSE) para validação.
EXPECTED = {
    ("2018", "1"): {"bo": 49_277_010, "pt": 31_342_051, "vv": 107_050_749, "ap": 147_306_275, "comp": 117_364_654},
    ("2018", "2"): {"bo": 57_797_847, "pt": 47_040_906},
    ("2022", "1"): {"pt": 57_259_504, "bo": 51_072_345, "vv": 118_229_719, "ap": 156_454_011, "comp": 123_682_372},
    ("2022", "2"): {"pt": 60_345_999, "bo": 58_206_354, "vv": 118_552_353},
}

# Diferenças residuais conhecidas (dados abertos x divulgação oficial) — não reprovam a validação.
KNOWN_RESIDUAL = {
    # O detalhe_votacao_munzona_2018 (regerado pelo TSE em 13/11/2024) soma 147.306.295 aptos no
    # 1º turno (147.306.294 no 2º), 20 a mais que o eleitorado divulgado em 2018 (147.306.275).
    # Comparecimento, abstenção, brancos, nulos e votos batem exatamente; a diferença é da base
    # de eleitorado do arquivo aberto e não afeta percentuais de votos válidos.
    ("2018", "1", "ap"): 20,
}


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download(url: str, dest: Path, refresh: bool = False) -> Path:
    if dest.exists() and not refresh and zipfile.is_zipfile(dest):
        log(f"  [cache] {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    log(f"  [download] {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "apuracao-2026-hist/1.0"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        done, next_report = 0, 50e6
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if done >= next_report:
                pct = f" ({100 * done / total:.0f}%)" if total else ""
                log(f"    {done / 1e6:.0f} MB{pct}")
                next_report += 50e6
    if total and tmp.stat().st_size != total:
        raise RuntimeError(f"download incompleto: {url} ({tmp.stat().st_size} != {total})")
    os.replace(tmp, dest)
    log(f"    ok {dest.stat().st_size / 1e6:.1f} MB em {time.time() - t0:.1f}s")
    return dest


def open_br_csv(zpath: Path, prefix: str, ano: str):
    """Abre o CSV '{prefix}_{ano}_BR.csv' (Presidente, todas as UFs) de dentro do zip.

    Fallback: '{prefix}_{ano}_BRASIL.csv' (todos os cargos; filtrado por CD_CARGO depois).
    """
    z = zipfile.ZipFile(zpath)
    names = {n.upper(): n for n in z.namelist()}
    for suffix in (f"{prefix}_{ano}_BR.CSV", f"{prefix}_{ano}_BRASIL.CSV"):
        if suffix.upper() in names:
            member = names[suffix.upper()]
            log(f"  lendo {zpath.name}:{member}")
            fh = z.open(member)
            return csv.reader(io.TextIOWrapper(fh, encoding="latin-1", newline=""), delimiter=";", quotechar='"')
    raise RuntimeError(f"CSV nacional não encontrado em {zpath}: {z.namelist()}")


def to_int(s: str) -> int:
    s = s.strip()
    if not s or s.startswith("#"):
        return 0
    return int(s)


# ---------------------------------------------------------------------------
# Agregação
# ---------------------------------------------------------------------------

def new_res() -> dict:
    return {k: 0 for k in FIELDS}


def aggregate(cache: Path, refresh: bool):
    """Retorna mun[(ano, turno, uf, cd)] = HistResult  e checagens auxiliares."""
    mun: dict[tuple, dict] = defaultdict(new_res)
    nomes: dict[tuple, str] = {}  # (uf, cd) -> NM_MUNICIPIO (para relatórios)
    seen_cand: set[tuple] = set()
    seen_det: set[tuple] = set()
    det_vv: dict[tuple, int] = defaultdict(int)  # QT_VOTOS_NOMINAIS_VALIDOS do detalhe (checagem cruzada)
    extra: dict[tuple, dict] = defaultdict(lambda: defaultdict(int))  # anulados etc. por (ano, turno)

    for ano in ANOS:
        # --- votos por candidato --------------------------------------------
        zc = download(f"{ODSELE}/votacao_candidato_munzona/votacao_candidato_munzona_{ano}.zip",
                      cache / f"votacao_candidato_munzona_{ano}.zip", refresh)
        rd = open_br_csv(zc, "votacao_candidato_munzona", ano)
        h = {c: i for i, c in enumerate(next(rd))}
        i_cargo, i_turno, i_uf, i_mun = h["CD_CARGO"], h["NR_TURNO"], h["SG_UF"], h["CD_MUNICIPIO"]
        i_nr = h["NR_CANDIDATO"]
        i_val = h.get("QT_VOTOS_NOMINAIS_VALIDOS")
        i_nom = h["QT_VOTOS_NOMINAIS"]
        i_dest = h.get("NM_TIPO_DESTINACAO_VOTOS")
        i_nm = h.get("NM_MUNICIPIO")
        n = 0
        for row in rd:
            if row[i_cargo] != "1":
                continue
            n += 1
            turno = row[i_turno]
            uf = row[i_uf].lower()
            cd = row[i_mun].strip().zfill(5)
            key = (ano, turno, uf, cd)
            seen_cand.add(key)
            if i_nm is not None:
                nomes[(uf, cd)] = row[i_nm]
            if i_val is not None:
                votos = to_int(row[i_val])
            else:  # layout antigo: só conta destinação "Válido"
                dest = row[i_dest] if i_dest is not None else "Válido"
                votos = to_int(row[i_nom]) if dest.startswith("V") else 0
            nominais = to_int(row[i_nom])
            if nominais != votos:
                extra[(ano, turno)]["nominais_nao_validos"] += nominais - votos
            r = mun[key]
            r["vv"] += votos
            nr = row[i_nr]
            if nr == NUM_PT[ano]:
                r["pt"] += votos
            elif nr == NUM_BO[ano]:
                r["bo"] += votos
        log(f"    {n} linhas (Presidente)")

        # --- detalhe (comparecimento, brancos, nulos) -----------------------
        zd = download(f"{ODSELE}/detalhe_votacao_munzona/detalhe_votacao_munzona_{ano}.zip",
                      cache / f"detalhe_votacao_munzona_{ano}.zip", refresh)
        rd = open_br_csv(zd, "detalhe_votacao_munzona", ano)
        h = {c: i for i, c in enumerate(next(rd))}
        i_cargo, i_turno, i_uf, i_mun = h["CD_CARGO"], h["NR_TURNO"], h["SG_UF"], h["CD_MUNICIPIO"]
        i_nulos = h.get("QT_TOTAL_VOTOS_NULOS", h.get("QT_VOTOS_NULOS"))
        opt = [c for c in ("QT_TOTAL_VOTOS_ANULADOS", "QT_TOTAL_VOTOS_ANUL_SUBJUD", "QT_VOTOS_ANULADOS_APU_SEP",
                           "QT_VOTOS_NULOS_TECNICOS") if c in h]
        n = 0
        for row in rd:
            if row[i_cargo] != "1":
                continue
            n += 1
            turno = row[i_turno]
            uf = row[i_uf].lower()
            cd = row[i_mun].strip().zfill(5)
            key = (ano, turno, uf, cd)
            seen_det.add(key)
            if "NM_MUNICIPIO" in h:
                nomes.setdefault((uf, cd), row[h["NM_MUNICIPIO"]])
            r = mun[key]
            r["ap"] += to_int(row[h["QT_APTOS"]])
            r["comp"] += to_int(row[h["QT_COMPARECIMENTO"]])
            r["abst"] += to_int(row[h["QT_ABSTENCOES"]])
            r["vb"] += to_int(row[h["QT_VOTOS_BRANCOS"]])
            r["vn"] += to_int(row[i_nulos])
            if "QT_VOTOS_NOMINAIS_VALIDOS" in h:
                det_vv[key] += to_int(row[h["QT_VOTOS_NOMINAIS_VALIDOS"]])
            for c in opt:
                extra[(ano, turno)][c] += to_int(row[h[c]])
        log(f"    {n} linhas (Presidente)")

    return mun, seen_cand, seen_det, det_vv, extra, nomes


def add_into(dst: dict, src: dict):
    for k in FIELDS:
        dst[k] += src[k]


def build_tree(mun):
    br: dict = {}
    ufs: dict = {}
    muns: dict = {}
    br_tot: dict = defaultdict(new_res)
    uf_tot: dict = defaultdict(new_res)
    for (ano, turno, uf, cd), r in mun.items():
        add_into(br_tot[(ano, turno)], r)
        add_into(uf_tot[(ano, turno, uf)], r)
        muns.setdefault(uf, {}).setdefault(cd, {}).setdefault(ano, {})[turno] = {k: r[k] for k in FIELDS}
    for (ano, turno), r in sorted(br_tot.items()):
        br.setdefault(ano, {})[turno] = {k: r[k] for k in FIELDS}
    for (ano, turno, uf), r in sorted(uf_tot.items()):
        ufs.setdefault(uf, {}).setdefault(ano, {})[turno] = {k: r[k] for k in FIELDS}
    return br, ufs, muns, br_tot, uf_tot


def sort_hist(h: dict) -> dict:
    return {ano: {t: h[ano][t] for t in sorted(h[ano])} for ano in sorted(h)}


# ---------------------------------------------------------------------------
# Nomes de municípios (Title Case pt-BR)
# ---------------------------------------------------------------------------

LOWER_WORDS = {"de", "da", "do", "das", "dos", "e", "del", "es", "of", "no", "em", "na", "nas", "nos"}
ROMAN = re.compile(r"^(?=[IVXLC]+$)C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")


def _cap(w: str) -> str:
    return w[:1].upper() + w[1:].lower() if w else w


def _word(w: str, first: bool, prev: str) -> str:
    lw = w.lower()
    if ROMAN.match(w.upper()) and len(w) > 1:
        return w.upper()
    if "'" in w:
        a, b = w.split("'", 1)
        if a.lower() == "d" and not first:  # D'OESTE -> d'Oeste, D'ÁGUA -> d'Água
            return "d'" + _cap(b)
        return _cap(a) + "'" + _cap(b)  # SANT'ANA -> Sant'Ana
    if not first and (lw in LOWER_WORDS or (lw == "la" and prev == "de")):
        return lw
    return _cap(w)


def title_pt(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    out = []
    prev = ""
    for i, tok in enumerate(name.split(" ")):
        parts = tok.split("-")
        conv = []
        for j, p in enumerate(parts):
            first = i == 0 and j == 0
            conv.append(_word(p, first, prev))
            prev = p.lower()
        out.append("-".join(conv))
    return " ".join(out)


def sort_key(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").casefold()


def build_municipios(cm_path: Path):
    d = json.loads(cm_path.read_text(encoding="utf-8"))
    rows = []
    for a in d["abr"]:
        uf = a["cd"].lower()
        for m in a["mu"]:
            rows.append([m["cd"].zfill(5), title_pt(m["nm"]), uf, (m.get("cdi") or "").strip()])
    rows.sort(key=lambda r: (r[2], sort_key(r[1]), r[0]))
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def fmt(n) -> str:
    return f"{n:,}".replace(",", ".") if isinstance(n, int) else str(n)


def write_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(txt, encoding="utf-8")
    return path.stat().st_size


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache-dir", default=os.environ.get("HIST_CACHE_DIR")
                    or str(Path(tempfile.gettempdir()) / "apuracao-2026-tse-cache"))
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--cm", default=str(PROJECT / "test-fixtures" / "tse" / "oficial-mun-e006257-cm.json"))
    ap.add_argument("--out", default=str(PROJECT / "public" / "data"))
    args = ap.parse_args()

    cache = Path(args.cache_dir)
    out = Path(args.out)
    log(f"cache: {cache}\nsaida: {out}")

    mun, seen_cand, seen_det, det_vv, extra, nomes = aggregate(cache, args.refresh)
    br, ufs, muns, br_tot, uf_tot = build_tree(mun)
    ok = True

    # --- consistência interna ----------------------------------------------
    only_c = sorted(seen_cand - seen_det)
    only_d = sorted(seen_det - seen_cand)
    if only_c:
        ok = False
        log(f"\n[ERRO] municípios com votos mas sem detalhe (aptos/comparecimento): {only_c[:20]} ({len(only_c)})")
    if only_d:
        sem_comp = [k for k in only_d if mun[k]["comp"] == 0]
        log(f"\n[info] {len(only_d)} município/turno só no detalhe (sem votos nominais); "
            f"{len(sem_comp)} deles com comparecimento 0 (seções não instaladas no exterior): "
            + ", ".join(f"{k[0]}T{k[1]} {k[2]}/{k[3]} {nomes.get((k[2], k[3]), '')}" for k in only_d[:12])
            + (" ..." if len(only_d) > 12 else ""))
    vv_mismatch = [(k, mun[k]["vv"], det_vv[k]) for k in det_vv if mun[k]["vv"] != det_vv[k]]
    log(f"\nchecagem vv (candidatos) x QT_VOTOS_NOMINAIS_VALIDOS (detalhe), por município: "
        f"{len(vv_mismatch)} divergências" + (f" ex.: {vv_mismatch[:5]}" if vv_mismatch else ""))
    if vv_mismatch:
        ok = False
    ident = defaultdict(int)
    for k, r in mun.items():
        if r["comp"] != r["vv"] + r["vb"] + r["vn"]:
            ident[(k[0], k[1])] += 1
        if r["ap"] != r["comp"] + r["abst"]:
            ident[(k[0], k[1], "ap")] += 1
    for (ano, turno), r in sorted(br_tot.items()):
        e = extra[(ano, turno)]
        resto = r["comp"] - r["vv"] - r["vb"] - r["vn"]
        log(f"  {ano} T{turno}: comp - (vv+vb+vn) = {resto}; "
            + ", ".join(f"{k}={v}" for k, v in sorted(e.items()))
            + f"; municípios com comp != vv+vb+vn: {ident.get((ano, turno), 0)}"
            + f"; com ap != comp+abst: {ident.get((ano, turno, 'ap'), 0)}")

    # --- validação contra totais oficiais ----------------------------------
    log("\nVALIDAÇÃO (totais nacionais oficiais x calculado)")
    log(f"  {'ano':4} {'T':1} {'campo':5} {'esperado':>14} {'calculado':>14} {'dif':>6}")
    for (ano, turno), exp in EXPECTED.items():
        got = br[ano][turno]
        for k, v in exp.items():
            diff = got[k] - v
            known = KNOWN_RESIDUAL.get((ano, turno, k))
            flag = "ok" if diff == 0 else ("residual conhecido" if diff == known else "DIVERGE")
            if diff and diff != known:
                ok = False
            log(f"  {ano} {turno} {k:5} {fmt(v):>14} {fmt(got[k]):>14} {diff:>6} {flag}")

    # br == soma(ufs) e uf == soma(municípios)
    sums_ok = True
    for ano in br:
        for turno in br[ano]:
            s = new_res()
            for uf in ufs:
                if ano in ufs[uf] and turno in ufs[uf][ano]:
                    add_into(s, ufs[uf][ano][turno])
            if s != br[ano][turno]:
                ok = sums_ok = False
                log(f"  [ERRO] br != soma(ufs) em {ano} T{turno}")
            for uf in ufs:
                sm = new_res()
                for cd, hb in muns.get(uf, {}).items():
                    if turno in hb.get(ano, {}):
                        add_into(sm, hb[ano][turno])
                if ufs[uf].get(ano, {}).get(turno) and sm != ufs[uf][ano][turno]:
                    ok = sums_ok = False
                    log(f"  [ERRO] {uf} != soma(municípios) em {ano} T{turno}")
    log(f"  br == soma(ufs incl. zz) e uf == soma(municípios): {'ok' if sums_ok else 'ver erros acima'}")
    missing_ufs = [u for u in UFS if u not in ufs]
    if missing_ufs:
        log(f"  [aviso] UFs sem dados: {missing_ufs}")

    # --- escrita -----------------------------------------------------------
    hist_dir = out / "hist"
    sizes = {}
    br_file = {"br": sort_hist(br), "ufs": {u: sort_hist(ufs[u]) for u in UFS if u in ufs}}
    for u in sorted(set(ufs) - set(UFS)):
        br_file["ufs"][u] = sort_hist(ufs[u])
    sizes["hist/br.json"] = write_json(hist_dir / "br.json", br_file)
    for uf in sorted(muns):
        data = {cd: sort_hist(muns[uf][cd]) for cd in sorted(muns[uf])}
        sizes[f"hist/mun/{uf}.json"] = write_json(hist_dir / "mun" / f"{uf}.json", data)

    municipios = build_municipios(Path(args.cm))
    sizes["municipios.json"] = write_json(out / "municipios.json", municipios)

    # --- cruzamento de códigos 2026 x histórico ------------------------------
    log("\nCRUZAMENTO DE CÓDIGOS (2026 cm x histórico)")
    cod26 = {(r[2], r[0]): r[1] for r in municipios}
    hist_codes = {ano: {(k[2], k[3]) for k in mun if k[0] == ano} for ano in ANOS}
    for ano in ANOS:
        sem = sorted(k for k in cod26 if k not in hist_codes[ano])
        br_sem = [k for k in sem if k[0] != "zz"]
        zz_sem = [k for k in sem if k[0] == "zz"]
        log(f"  2026 sem dados de {ano}: {len(br_sem)} no Brasil, {len(zz_sem)} no exterior")
        for k in br_sem:
            log(f"    {k[0]}/{k[1]} {cod26[k]}")
        if zz_sem:
            log("    exterior: " + ", ".join(f"{k[1]} {cod26[k]}" for k in zz_sem))
        extra_codes = sorted(k for k in hist_codes[ano] if k not in cod26)
        log(f"  códigos de {ano} ausentes em 2026: {len(extra_codes)} "
            f"({sum(1 for k in extra_codes if k[0] != 'zz')} Brasil, {sum(1 for k in extra_codes if k[0] == 'zz')} exterior)")
        if extra_codes:
            log("    " + ", ".join(f"{k[0]}/{k[1]} {nomes.get(k, '')}" for k in extra_codes))

    log("\nARQUIVOS")
    total = 0
    for p, s in sizes.items():
        total += s
        log(f"  public/data/{p}: {s / 1024:.1f} KB")
    log(f"  total: {total / 1024:.1f} KB ({len(municipios)} municípios em municipios.json)")
    log("\nRESULTADO: " + ("OK" if ok else "COM DIVERGÊNCIAS"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
