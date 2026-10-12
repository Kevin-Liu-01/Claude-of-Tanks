  // ---- the step ----
  function sortOrder(): void {
    orderCount = 0;
    for (let i = 0; i < capacity; i++) if (active[i]) order[orderCount++] = i;
    // insertion sort by min x, slot order on ties (deterministic, near-linear for coherent motion)
    for (let a = 1; a < orderCount; a++) {
      const v = order[a];
      const key = bminX[v];
      let b = a - 1;
      while (b >= 0 && (bminX[order[b]] > key || (bminX[order[b]] === key && order[b] > v))) { order[b + 1] = order[b]; b--; }
      order[b + 1] = v;
    }
  }

  /** A sleeper a moving kinematic box reaches wakes (a hull shoving a resting turret). */
  function sleeperMetByMover(i: number): boolean {
    const r = shapes[i]!.radius + CONTACT_MARGIN_M;
    for (let k = 0; k < kinematicCount; k++) {
      const o = k * 6;
      const moving = kv[o] * kv[o] + kv[o + 1] * kv[o + 1] + kv[o + 2] * kv[o + 2]
        + kv[o + 3] * kv[o + 3] + kv[o + 4] * kv[o + 4] + kv[o + 5] * kv[o + 5];
      if (moving < 0.0025) continue;
      const c = k * 3;
      const rr = kRadius[k] + r;
      const dx = px[i] - kc[c], dy = py[i] - kc[c + 1], dz = pz[i] - kc[c + 2];
      if (dx * dx + dy * dy + dz * dz > rr * rr) continue;
      // the exact test: any contact sphere inside the box (or the box's corners in the body)
      const start = contactCount;
      bodyContactStart = start;
      kinematicContacts(i);
      let met = false;
      for (let n = start; n < contactCount; n++) if (cDepth[n] > 0) { met = true; break; }
      contactCount = start;
      if (met) return true;
    }
    return false;
  }

  let lastAwake = 0;
  function step(dt = RIGID_STEP_S): void {
    impactCount = 0;
    contactCount = 0;
    if (!environment) return;
    let any = false;
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      ppx[i] = px[i]; ppy[i] = py[i]; ppz[i] = pz[i];
      pqx[i] = qx[i]; pqy[i] = qy[i]; pqz[i] = qz[i]; pqw[i] = qw[i];
      age[i]++;
      if (impactCooldown[i] > 0) impactCooldown[i]--;
      if (ignoreOwnerSteps[i] > 0) ignoreOwnerSteps[i]--;
      if (asleep[i]) {
        updateRotation(i);
        updateSpheres(i);
        if (sleeperMetByMover(i)) wake(i);
        else if (++supportClock[i] >= SUPPORT_CHECK_STEPS) {
          // a sleeper re-checks its support now and then (a crater dug or a building gone under it)
          supportClock[i] = 0;
          const start = contactCount;
          bodyContactStart = start;
          groundContacts(i); staticContacts(i); kinematicContacts(i);
          let supported = false;
          for (let c = start; c < contactCount; c++) if (cNy[c] > 0.3) { supported = true; break; }
          contactCount = start;
          if (!supported) wake(i);
        }
        if (asleep[i]) continue;
      }
      any = true;
      vy[i] -= gravity * dt;
    }
    if (!any) { lastAwake = 0; return; }
    for (let i = 0; i < capacity; i++) {
      if (!active[i]) continue;
      updateRotation(i);
      updateSpheres(i);
      bestImpact[i] = 0;
      bestImpactContact[i] = -1;
      touching[i] = 0;
    }
    sortOrder();
    // the ground, the static records and the kinematic boxes, for every awake body (its own budget each)
    for (let n = 0; n < orderCount; n++) {
      const i = order[n];
      if (asleep[i]) continue;
      bodyContactStart = contactCount;
      groundContacts(i);
      staticContacts(i);
      kinematicContacts(i);
    }
    // body pairs by the sweep on min x (each overlapping pair once, its own budget)
    for (let n = 0; n < orderCount; n++) {
      const i = order[n];
      for (let m = n + 1; m < orderCount; m++) {
        const j = order[m];
        if (bminX[j] > bmaxX[i]) break;
        if (asleep[i] && asleep[j]) continue;
        if (bmaxY[j] < bminY[i] || bminY[j] > bmaxY[i] || bmaxZ[j] < bminZ[i] || bminZ[j] > bmaxZ[i]) continue;
        const start = contactCount;
        bodyContactStart = start;
        pairContacts(i, j);
        if (contactCount === start || (!asleep[i] && !asleep[j])) continue;
        // a sleeper met hard wakes; one only rested on stays asleep and acts as fixed ground for this step
        let hard = false;
        for (let c = start; c < contactCount; c++) {
          relativeVelocityRaw(c, rv);
          const speed = Math.abs(rv[0] * cNx[c] + rv[1] * cNy[c] + rv[2] * cNz[c]);
          if (speed > WAKE_MPS || cDepth[c] > 0.05) { hard = true; break; }
        }
        if (hard) { wake(i); wake(j); continue; }
        for (let c = start; c < contactCount; c++) {
          const a = cA[c];
          if (asleep[a]) {
            // the sleeper's sphere in the awake body: the same contact seen from the awake side
            cA[c] = cB[c]; cNx[c] = -cNx[c]; cNy[c] = -cNy[c]; cNz[c] = -cNz[c];
          }
          cB[c] = -2; cSphere[c] = -1; cPartner[c] = PARTNER_NONE;
        }
      }
    }
    for (let c = 0; c < contactCount; c++) {
      touching[cA[c]] = 1;
      if (cB[c] >= 0) touching[cB[c]] = 1;
    }
    prepareContacts(dt);
    solveVelocities();
    solvePositions();
    storeWarmStart();
    let awake = 0;
    for (let i = 0; i < capacity; i++) {
      if (!active[i] || asleep[i]) continue;
      integrate(i, dt);
      // impact report: the body's strongest approach this step
      if (bestImpactContact[i] >= 0 && bestImpact[i] > IMPACT_MIN_MPS && impactCooldown[i] === 0 && impactCount < MAX_IMPACTS_PER_STEP) {
        const c = bestImpactContact[i];
        const n = impactCount++;
        impactX[n] = cPx[c]; impactY[n] = cPy[c]; impactZ[n] = cPz[c];
        impactSpeed[n] = bestImpact[i]; impactMass[n] = shapes[i]!.mass; impactSlot[n] = i;
        const b = cB[c];
        impactPartner[n] = b >= 0 ? RIGID_PARTNER.BODY : b === -1 ? RIGID_PARTNER.GROUND : b === -2 ? RIGID_PARTNER.STATIC : RIGID_PARTNER.KINEMATIC;
        impactCooldown[i] = IMPACT_COOLDOWN_STEPS;
      }
      sleepCheck(i);
      if (!asleep[i]) awake++;
    }
    lastAwake = awake;
  }
