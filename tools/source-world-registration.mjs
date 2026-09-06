// QA-only certificates for independently normalized local comparison files.
// Coordinates are source measurements, not candidate-fit outputs. The hashes
// identify the canonical local oracles, not licenses or redistributable assets.
export const SOURCE_WORLD_FRAMES = Object.freeze({
  leo2a5_x: {
    sha256:'41b3cc644e2e9610b0b47a8e6e193a90929c711e13b10716057942807493ce99',
    turret:[0,1.662,.661], gun:[.0238,1.9979,1.659],
  },
  t90a_x: {
    sha256:'f0ba16a464dc7e9584ea382f11e5e98481b2945db2b8a2f134dfbae4fbba793d',
    turret:[.010,1.468,-.0039], gun:[.005,1.8174,1.30],
  },
  t90m_x: {
    sha256:'926571090982af867c43277c0f77a73501f6559dac363d33dc42bf157ebd0e60',
    turret:[.018092,1.336748,-.104459], gun:[.001973,1.608251,1.140604],
  },
  t90sm_x: {
    sha256:'48f04021a53a883b5603c33c73d9652718eb14e451f039256b8e148d920452b1',
    turret:[.008,1.532,.359], gun:[.001,1.90309,1.56],
  },
  kf51_x: {
    sha256:'82735650f85c1b8144ee9b87cb95d0ec230f0e627f34694ffa9116dd17dd2722',
    turret:[0,1.4596,.5185], gun:[0,1.85491175,1.3478],
  },
});

const IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));

/** Fail closed: no declaration alone can switch off registration. */
export function validateSourceWorldFrame(certificate, measuredHash, frames) {
  const failures=[];
  if (!certificate || measuredHash !== certificate.sha256) failures.push('canonical oracle hash mismatch');
  for (const owner of ['reference','procedural']) {
    const frame=frames?.[owner];
    const matrix=frame?.rootMatrix;
    if (!Array.isArray(matrix) || matrix.length !== 16
      || matrix.some((v,i)=>!Number.isFinite(v) || Math.abs(v-IDENTITY[i])>.002)) {
      failures.push(`${owner}: world root must be unit-scale, ground-zero and unrotated`);
    }
    for (const anchor of ['hull','turret','gun']) {
      const expected=anchor==='hull' ? [0,0,0] : certificate?.[anchor];
      const actual=frame?.[anchor];
      // Source datums are measured to millimetres; procedural pivots may use
      // rounded authoring coordinates, but never more than 12 mm departure.
      const tolerance=owner==='reference' ? .004 : .012;
      if (!finiteVector(expected) || !finiteVector(actual) || distance(expected,actual)>tolerance) {
        failures.push(`${owner}: ${anchor} differs from the independent source datum`);
      }
    }
  }
  return { passed:failures.length===0, failures, mode:'canonical-source-world',
    ...(failures.length ? {} : { fixedReg:{dAlong:0,dy:0} }) };
}

export async function hashLocalOracle(url) {
  if (!url?.startsWith('/models/community-candidates/')) throw new Error('Expected private local oracle path');
  const response=await fetch(url);
  if (!response.ok) throw new Error(`Cannot verify canonical oracle: ${response.status}`);
  const hash=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
