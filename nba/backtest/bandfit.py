#!/usr/bin/env python3
"""Fit per-(prop, variation band) mean-calibration cells on the VALIDATION season.
Run from repo root. TRAIN=2023-24 history, TEST=2024-25 validation. Outputs ratio = actual/predicted
mean per band, to be shrunk toward 1.0 by cell n (k=300) and frozen into classification_ladder_v1.py
(BAND_RATIO / BAND_N). Never fit on the walk-forward season (2025-26)."""
import json, math, numpy as np, pandas as pd
src=open('nba/backtest/classification_ladder_v1.py').read()
head=src.split('reliab = []')[0]
head=head.replace('TRAIN = ["2023-24", "2024-25"]; TEST = ["2025-26"]','TRAIN = ["2023-24"]; TEST = ["2024-25"]')
exec(head)
VB={"points":[(0,9.5,"FRINGE"),(9.5,17.5,"ROLE"),(17.5,25.5,"STARTER"),(25.5,31.5,"STAR"),(31.5,99,"SUPERSTAR")],"rebounds":[(0,3.5,"LOW"),(3.5,6.5,"MID"),(6.5,9.5,"HIGH"),(9.5,99,"ELITE")],"assists":[(0,2.5,"LOW"),(2.5,5.5,"MID"),(5.5,8.5,"HIGH"),(8.5,99,"ELITE")],"threes_made":[(0,1.5,"LOW"),(1.5,2.5,"MID"),(2.5,4.5,"HIGH"),(4.5,99,"ELITE")]}
fits={}
for prop,cfg in PROPS.items():
    col=cfg["col"]; rate_col=cfg.get("att_col",col)
    df=pg.copy(); df["per36"]=np.where(df["MINF"]>0, df[rate_col]/df["MINF"]*36, np.nan)
    gg=df.groupby(["season","PLAYER_ID"])
    df["rate36"]=gg["per36"].transform(lambda s: ewma_prior(s,cfg["alpha"])); df["n_rate"]=gg["per36"].transform(lambda s: s.shift(1).notna().cumsum())
    df["ym"]=pd.to_datetime(df["GAME_DATE"]).dt.to_period("M").astype(str)
    d=df[df["rate36"].notna()&df["proj_min"].notna()&(df["proj_min"]>=8)].copy()
    tp={}
    for (s,ym,role),grp in d.groupby(["season","ym","role_tier"]):
        pop=grp.groupby("PLAYER_ID")["rate36"].last(); n=len(pop); tt=max(1,min(MAX_TIERS,n//MIN_PER_TIER))
        ranks=pop.rank(pct=True,method="first"); tier_of=np.minimum(tt,np.floor(ranks*tt)+1).astype(int)
        tm=pop.groupby(tier_of).mean(); tn=pop.groupby(tier_of).size(); pm=pop.mean()
        for pid,t in tier_of.items(): tp[(s,ym,role,pid)]=(tn[t]*tm[t]+TIER_BLEND_K*pm)/(tn[t]+TIER_BLEND_K)
    d["tier_prior"]=[tp.get((s,y,r,p),np.nan) for s,y,r,p in zip(d["season"],d["ym"],d["role_tier"],d["PLAYER_ID"])]
    k=cfg["k_stab"]; n=d["n_rate"].clip(lower=1); d["mean"]=(n*d["rate36"]+k*d["tier_prior"])/(n+k)*d["proj_min"]/36
    if cfg["family"]=="compound":
        ew_m=gg[col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"],adjust=False,min_periods=3).mean()).loc[d.index]; ew_a=gg[rate_col].transform(lambda s2: s2.shift(1).ewm(alpha=cfg["pct_alpha"],adjust=False,min_periods=3).mean()).loc[d.index]
        pop_pct=float(d[d.season.isin(TRAIN)][col].sum()/max(1,d[d.season.isin(TRAIN)][rate_col].sum()))
        att_seen=ew_a.fillna(0)*20; praw=(ew_m/ew_a.replace(0,np.nan)).fillna(pop_pct)
        d["mean"]=d["mean"]*((att_seen*praw+60.0*pop_pct)/(att_seen+60.0)).clip(0.05,0.6)
    t=d[d.season.isin(TEST)].copy()
    t["vb"]=[next((kk for lo,hi,kk in VB[prop] if lo<=a<hi),"ELITE") for a in np.floor(t["mean"])+0.5]
    g=t.groupby("vb").agg(n=("mean","size"),pred=("mean","mean"),act=(col,"mean"))
    g["ratio"]=g["act"]/g["pred"]; fits[prop]={b:{"ratio":round(float(r.ratio),4),"n":int(r.n)} for b,r in g.iterrows()}
    print(prop); print(g.round(3).to_string()); print()
json.dump(fits, open("nba/backtest/reports/band_mean_ratio_fit_2024_25.json","w"), indent=2); print(fits)
