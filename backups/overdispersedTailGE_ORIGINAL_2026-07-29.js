// BACKUP - taken 2026-07-29 before replacing the Normal-approximation with Negative Binomial.
// Source: alphadog-v2-phase3a-first-inning-pitcher-context.js, around line 4429-4431.
// This is the ORIGINAL, KNOWN-WORKING version. If the NB replacement causes any issue
// (production hang, wrong values, etc.), restore this exact code via github_patch_file.

function poissonTailGE(k,lambda){ k=Math.ceil(k); lambda=Math.max(0,Number(lambda||0)); if(k<=0) return 1; if(lambda<=0) return 0; let term=Math.exp(-lambda), sum=term; for(let i=1;i<k;i++){ term*=lambda/i; sum+=term; if(i>250) break; } return clamp(1-sum,0,1); }

function overdispersedTailGE(k,mu,sigma=1){ mu=Math.max(0,Number(mu||0)); k=Math.ceil(k); if(mu<10 && sigma<=1.05) return poissonTailGE(k,mu); const sd=Math.sqrt(Math.max(0.0001,mu*sigma)); return clamp(1-normalCdf(k-0.5,mu,sd),0,1); }

// ROLLBACK: replace whatever overdispersedTailGE looks like at time of incident with the
// exact function body above (keeping poissonTailGE untouched - it was never modified).
