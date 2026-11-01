// tools/oracle-pins.mjs — the file each registered comparison oracle must be (Main's ruling 2026-11-01, 267): the geometry
// gate hashes the oracle it would load and refuses one whose sha256 is not its pin, naming the pinned hash, before the page
// loads (tools/geometry-gate.mjs; geometry-gate-policy.mjs oraclePinError), so no record is measured on an unverified file.
// Keyed by the registered path (as the page fetches it); a certified source's pin is its certificate's sha256
// (tools/source-world-registration.mjs). Pinned 2026-11-01 from the files that reproduce their committed records on this
// machine; where none does, the version in use is registered with its reason (the evidence: ~/cot-lanes/oracle-pins-evidence:
// every copy on this machine and the archive's hash-named files tried, and the 55ff0b575d page on the same builds). A new
// version of an oracle is a new pin with its reason; a registered path with no pin is never measured.
const pin = (sha256, reason) => Object.freeze(reason ? { sha256, reason } : { sha256 });

export const ORACLE_PINS = Object.freeze({
  '/models/community-candidates/aft10_x_source.glb': pin('95212acdcac7ef46744dde58888f675fa65284dfd4b008b2f7fda717b4e18d79'), // aft10 (certificate)
  '/models/community-candidates/ajax_x_source.glb': pin('506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0'), // ajax (certificate)
  '/models/community-candidates/amx-40_armored_warfare.glb': pin('570a12b0ced56299061fc0a57c3f86343d2aa45e2fb79d53e049f58da2e9849d',
    "the main checkout's version; the record moved 56.6 -> 61.2 with the build (the 266 Leclerc/AMX-40 round), curves on this file"), // amx40_proto
  '/models/community-candidates/amx30_x_source.glb': pin('55f4ec8837caa90c4ad976fdfd974bd9761497b27d963e3af84f040b9126bae5'), // amx30b (certificate)
  '/models/community-candidates/amx40_x_source.glb': pin('2b67a377fbd39d6a80e4d9511a2b890ec4abd19db37c41b1e7a6142d5c990079'), // amx40 (certificate)
  '/models/community-candidates/ares_apc_x_source.glb': pin('f43fce5b07bcd04f6089aa23338ed3c4114ff75866eec0ce98e1800171891ff1'), // ares_apc (certificate)
  '/models/community-candidates/ariete_c1_arrafi.glb': pin('02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4'), // c1_ariete_proto_serie1, c2_ariete_proto
  '/models/community-candidates/ariete_c1_x_source.glb': pin('1f33b3966189c876c8e507a57c59def5e6f3a70334d42315e0366911aedb6177'), // c1_ariete (certificate)
  '/models/community-candidates/bm_oplot_m_x_source.glb': pin('d2adad43bba88a867f743aeeacf969587e7be0c2bbcaeee0259218f3145ab22a'), // bm_oplot_m (certificate)
  '/models/community-candidates/bmp3_rok_42manako.glb': pin('c20e0afef722fc82c816f12326b63f7dc67081be72bb1c2ac6d5e79a99e62432'), // bmp3
  '/models/community-candidates/bmp3m_dragun125_x_assembled_20260918.glb': pin('d79a8383dd79d8dfefc98ae47b9b12d6c60bac55df3eb1671266fef6029fc8e8'), // bmp3m_dragun125 (certificate)
  '/models/community-candidates/challenger1_x_source.glb': pin('90a18f59e64509211fa15e4298fba40443766b8dbd9e6cfb1e7858ecad8f4e64'), // challenger1_mk3 (certificate)
  '/models/community-candidates/challenger3_td_x_source.glb': pin('6e3b3983f040319d9dd5c55fdcf850d438a6c0656ae46a62908f0c4baa387386'), // challenger3_td (certificate)
  '/models/community-candidates/chieftain5_x_source.glb': pin('2a781a798e4ffe8f99ab9f6750b8db8e132b236de51a021cac28cbb82f268e79'), // chieftain5 (certificate)
  '/models/community-candidates/chieftain_mk10_x_source.glb': pin('252e45ee57928c6256252fa7dcdba8c42bfc2c2c86a6d4548ea68291b45c6f85'), // chieftain_mk10 (certificate)
  '/models/community-candidates/cv90105_tml_x_source.glb': pin('6e5770019f47d2c3de157e4eee77257e0f7ad1680b18b0655a1197362070efcc'), // cv90105_tml (certificate)
  '/models/community-candidates/cv90_mkiv_x_source.glb': pin('29160cf92e8e2221cf8b441626f871104dafde6b3ef5a80d3ec91d1fe3c8649a'), // cv90_mk4 (certificate)
  '/models/community-candidates/fv510_milan_x_assembled_20260918.glb': pin('f9eeb72db9039d2355912ecb85471be2d5559493400eff3d6d211ad9fc366045'), // warrior_tes_h (certificate)
  '/models/community-candidates/griffin50_x_proportions_20260921.glb': pin('89b52b83f0d69744a1c666a89b7b3fa921d2bfa9cb219d01168b982300cdfad3'), // griffin50mm (certificate)
  '/models/community-candidates/jpz_e100_x_source.glb': pin('a7b6440b17c641b9c69947d263e8a1922ec137c269ccafc9dd63fa7c3e129571'), // jpz_e100 (certificate)
  '/models/community-candidates/k1a1_kojf.glb': pin('b36b620f868cccbdbc2a874c6967273e2cc712b7df83c6e1bc054ec95bad24a0'), // k1e1
  '/models/community-candidates/k1a1_x_source.glb': pin('16280a971fc1364dfda606e236d4d5cce214ab73112121c02845123c8bc03a46'), // k1a1 (certificate)
  '/models/community-candidates/k21_x_assembled_20260918.glb': pin('e2103e87628337778107ba4beec0fb5f6ad9e29136eab65ba27aa7f8bfdd956b'), // k21 (certificate)
  // /models/community-candidates/k2_black_panther_source.glb: k2_black_panther: no copy on this machine, not pinned (the gate refuses it until one is registered)
  '/models/community-candidates/kf41_lynx_x_source.glb': pin('999a4238c86319612a94b5b1204b477304c46b4e8ea9899097f4a9a7a3377b9f'), // kf41_lynx (certificate)
  '/models/community-candidates/kf51_x_source.glb': pin('82735650f85c1b8144ee9b87cb95d0ec230f0e627f34694ffa9116dd17dd2722'), // kf51_panther (certificate)
  '/models/community-candidates/kurganets25_x_assembled_20260918.glb': pin('417ea9738b986a591ba049e25ef86fe2dd0f240048d3630d8f23551c17b7d793'), // kurganets25 (certificate)
  '/models/community-candidates/leclerc_classic_x_source.glb': pin('e1a3fa18589075da9fbe0bd19fb504ca1e3d579eae52b926c1d73a43e432e4f0'), // amx56 (certificate)
  '/models/community-candidates/leclerc_x_source.glb': pin('8d3f1061d6e9cfcf195052317859a57af9a7d7883050aed9538b77f3027e7c4e'), // leclerc_xlr (certificate)
  '/models/community-candidates/leo2_revolution_proto_preservation.glb': pin('ce63f41864d158627df7a89f0fc22e7f71ae753ded72e350206230bf2f417ff7'), // leo2_revolution_proto
  '/models/community-candidates/leo2a4m_arrafi.glb': pin('b3911324cf3119e1e7815cad115667a698407fe1921e4bd1e88970d8b2416b53'), // leo2a4m_can
  '/models/community-candidates/leo2a4m_x_source.glb': pin('59771994cef5162da9984892dac5f2142f91a6e1f887d87531176a692779e31b'), // leo2a5m
  '/models/community-candidates/leo2a5_x_source.glb': pin('41b3cc644e2e9610b0b47a8e6e193a90929c711e13b10716057942807493ce99'), // leo2a5 (certificate)
  '/models/community-candidates/leo2a6_x_source.glb': pin('5ea67b3783b6e33c13dabad34048697353758f011dec8aec19080001e14ae359'), // leo2a6 (certificate)
  '/models/community-candidates/leo2a6m_x_source.glb': pin('4f801ac2546229397307a77507c0658c44757a00cde970c871805e84068e2c30'), // leo2a6m
  '/models/community-candidates/leo2a7v_x_source.glb': pin('8cf3935defb761e0b6b02299d7c2af8648a949ee5733c8851f14525c5e2c9611'), // leo2a7v
  '/models/community-candidates/leopard_revolution_owner_2026.glb': pin('7a19d4244aa647a50cf7c1f18268da60329b11d14254a8c009ad09fac4c4b3f1'), // leo2_revolution
  '/models/community-candidates/m1a2_sepv2_dc_source.glb': pin('7fc3216da131d26e6389c4d40818f70ba03603c99812c5ae42c2f8b798910d16'), // m1a2_abrams_sepv2 (certificate)
  '/models/community-candidates/m3a3_bradley_sipriv.glb': pin('a5a3a985c8074a4383c97e33340e51d22f19860dfe3c2a072677f543d08ba4f2'), // m3a3_bradley
  // /models/community-candidates/m41_walker_bulldog_lowpoly.glb: m41a3: no copy on this machine, not pinned (the gate refuses it until one is registered)
  '/models/community-candidates/m48a5_patton_x_source.glb': pin('b54aff317407b292bd4d352a3d60ea0531a36bfbc3c21c698a9ba12ebb495285'), // m48a5_patton (certificate)
  '/models/community-candidates/m551_sheridan_war_thunder.glb': pin('d24f5245cd58d33d6bf7b41e2de46159a4a36a37cf9303d7f9df5c8b79b993c2',
    "the only version on this machine; it does not reproduce the 08-27 row (76.7 -> 0, also on the 55ff0b575d page)"), // m551_sheridan
  '/models/community-candidates/m60a1_x_source.glb': pin('c002db9dab0c31efb26bb8fb7586f0a2b347e673cab874760d4cdab866e00a8d'), // m60a1 (certificate)
  '/models/community-candidates/m60a2_x_source.glb': pin('d2d5e89f9ff357b110e9955ea64a13cd8aaafed0b31adbf45acafdabdaf96c86'), // m60a2 (certificate)
  '/models/community-candidates/m60a3_x_source.glb': pin('1eaf2699bfb8471b8a251b92679ba8e7149015745fadd33cf0a3b1f0a684b3fb'), // m60a3 (certificate)
  '/models/community-candidates/marder1a3_arrafi.glb': pin('edb6e865c8b064f831caacba6872f80eff94c33a0ceaf67276bd47fb005c8aeb'), // marder1a3
  '/models/community-candidates/mbt70_usa.glb': pin('2fe61a6bd2a44b58453fa4c8cfd07a6be07497a2fd5f0faece329652c4dd1c05'), // mbt70
  '/models/community-candidates/merkava1b_supplied_x_source.glb': pin('bcf4f84b9685fe25bbacbab3cd89a6d8ed5086fc37fa24267ef9e821e9b8c3aa'), // merkava1b (certificate)
  '/models/community-candidates/merkava2b_supplied_x_source.glb': pin('f15d59be87ffe27a1fa913371316d3a3ab7c0b2720ffeec8eec3a408a2979637'), // merkava2b (certificate)
  '/models/community-candidates/merkava2d_supplied_x_source.glb': pin('c76f1d522eb81314004c714c6fe98bcae19a06dd83f5ebaf5f3a54d76260c725'), // merkava2d (certificate)
  '/models/community-candidates/merkava3_baz_supplied_x_source.glb': pin('3f9ea08e23342137b519c767710750dcb4cb95ce7a9cf721323be6babd900760'), // merkava3_baz (certificate)
  '/models/community-candidates/merkava3c_supplied_x_source.glb': pin('7d55fb050e1d27b8c6a383484a443a5557052f122910a8fb650fe908b53c87aa'), // merkava3c (certificate)
  '/models/community-candidates/merkava3d_source.glb': pin('68aab556c5202455881862e5beae79fbe6b6dec4cf690ab3f1c73716e3bb3a5c'), // merkava3d (certificate)
  '/models/community-candidates/merkava4_barak_x_source.glb': pin('0549b50430cd8df0ebf9d095b617e64e8c6274747bea1dd99e4dec0e987b8f4d'), // merkava4_barak (certificate)
  // /models/community-candidates/merkava4_source.glb: merkava4: no copy on this machine, not pinned (the gate refuses it until one is registered)
  '/models/community-candidates/merkava4_trophy_x_source.glb': pin('a155cb6fb3ed46ef77e01f11fbd1d6cc8f5b8e747d09494f98f93579e396f684'), // merkava4_trophy (certificate)
  '/models/community-candidates/merkava4b_supplied_x_source.glb': pin('b3d01d76b9bec5e7e5ca28effb6824e15170b6dd72bb6c8f61e0eda195f6fd3e'), // merkava4b (certificate)
  '/models/community-candidates/namer_ifv_x_source.glb': pin('72afdec001c1013a7a847a176adf12f0d00d1863f29874797448fdb66d174870'), // namer_ifv (certificate)
  '/models/community-candidates/pl01_501st.glb': pin('224b88073367589b0d580f97157338c8447035abc1624999721aece80e1cc224'), // pl01, pl01_105
  '/models/community-candidates/sabra_mk2_x_source.glb': pin('5ea261fb70f728d3547159a6a6cf1519af2403e05e57c02d87d394ec9f573a2b'), // sabra_mk2 (certificate)
  '/models/community-candidates/spz_puma_s1_x_source.glb': pin('340e00fa8053680d2adbeabc10293264d07f743c9e5680462da8e081635cf4c0'), // puma_s1 (certificate)
  '/models/community-candidates/stb_1_owner.glb': pin('8dfb864cac84e5e1353a066f08deafe0a61060b028e45e4a1df9fcc42e2dc6a3'), // stb1
  '/models/community-candidates/strv103b_lamonekeli.glb': pin('58411c838ce805406e5925373b81e5451f81ab53a889e3744d7f5387af2cef98'), // strv103b
  '/models/community-candidates/strv122_x_source.glb': pin('d1ac97d98dd477d52850aaed8ae98184f9a3fd9b7ef20c5aadcf6c34d8e6d582'), // strv122 (certificate)
  '/models/community-candidates/strv81_x_source.glb': pin('66b2818a6cfe23a2f7be0ec7be68286e9969fb253d0c878a231aeec95e021aa1'), // centurion3, centurion5_2, strv81 (certificate)
  '/models/community-candidates/strv_103b.glb': pin('e0b0997377b43edf2e9a8123baa5f26b5ee3d28fc9ae0208c13826893870be80'), // strv103a
  '/models/community-candidates/t14_x_source.glb': pin('48745114206a2123e687f75477526caac0ad3896bd677639f44995d44b97e769'), // t14_armata
  '/models/community-candidates/t55a_x_source.glb': pin('b1f618c9982b08df3e1584903108367713696e17c72ea3f6ab589d2ad90385de',
    "the only version on this machine (the Type 59 lane); the 08-17 row scored 0, this file 91.8"), // t55a, type59
  '/models/community-candidates/t64bv_donbass_manako.glb': pin('99c27a43025c479ce8776aca798d43f557f64acbf60f5308ffb62d9885b6f3a5'), // t64bv_donbas
  '/models/community-candidates/t72b3_x_source.glb': pin('53d22b5ca53a742446dd957840233863735deda09b967ea1f1a79c9b2b03d797'), // t72b3 (certificate)
  '/models/community-candidates/t72b3m_x_source.glb': pin('1df241160448443c6cde0e13be959720acdf7b5ce3e21185ed82b0b308c744e2'), // t72b3m_2016 (certificate)
  '/models/community-candidates/t72b_1987_x_source.glb': pin('0d8a2541b648e0c6576de4b7e4b922948bf2ce97913fa363d9fc767746b7f7af'), // t72b_1987 (certificate)
  '/models/community-candidates/t72bu_x_source.glb': pin('d62a92b41e65c9c0085f73d6f402980f6c057bc3c6169b8dfcd7bc41ec019ec3'), // t72bu (certificate)
  '/models/community-candidates/t72m1_jaguar_manako.glb': pin('66448fcb66ee210a2efef015a2ad391714d61e7b847f41e4dc97474ad9c52358'), // t72m1_jaguar
  '/models/community-candidates/t80bv_ua_manako.glb': pin('4dd58764e838e39e7813260724ff0a06ddbde7955ad9a572d152e7ba352d8650'), // ua_t80bv
  '/models/community-candidates/t80u_kursk_manako.glb': pin('eaa2136bcb064fae8007c8f049a80b61c6ceba7ce10c591dc9d66f8253988308'), // t80u_kursk
  '/models/community-candidates/t80u_x_source.glb': pin('dcb16e5bc83c37e380a252c08462948a6ff9098738464ea4bee9e45ccb02df81'), // t80u (certificate)
  '/models/community-candidates/t90_x_source.glb': pin('619f5cec83ed3ceb8ab852bd1ae95b09d097e12631d8c89f3c0f19f56c7fa592'), // t90 (certificate)
  '/models/community-candidates/t90a_burlak_x_source.glb': pin('db1ca6b229f9925474dfda35727d76895e9a3b825af2c3b3a326cf2a6e7d0b52'), // t90a_burlak; t90a_burlak_proto's grafted turret (certificate)
  '/models/community-candidates/t90a_source.glb': pin('f0ba16a464dc7e9584ea382f11e5e98481b2945db2b8a2f134dfbae4fbba793d'), // t90a (certificate)
  '/models/community-candidates/t90a_vladimir_x_source.glb': pin('c3c41ccc322f5746727022964dc03760fab196183532d0e416884d97ffa8858c'), // t90a_vladimir
  '/models/community-candidates/t90a_x_source.glb': pin('f0ba16a464dc7e9584ea382f11e5e98481b2945db2b8a2f134dfbae4fbba793d'), // t90a_burlak_proto's composite hull (the t90a certificate's bytes)
  '/models/community-candidates/t90m_source.glb': pin('926571090982af867c43277c0f77a73501f6559dac363d33dc42bf157ebd0e60'), // t90m (certificate)
  '/models/community-candidates/t90ms_x_source.glb': pin('fd3d0c6e13b419ef76b431f6c96230407b9a07d43546a85d757ce82f78182ec5'), // t90ms_tagil (certificate)
  '/models/community-candidates/t90sm_source.glb': pin('48f04021a53a883b5603c33c73d9652718eb14e451f039256b8e148d920452b1'), // t90sm (certificate)
  '/models/community-candidates/tank_leopard_1.glb': pin('6cae5ea670df40cd8c5371635fa212f7b7b65f69dcfcd1d25645e3eae1b2eb87',
    "the only version on this machine; it does not reproduce the 08-20 row (36.2 -> 24.1, also on the 55ff0b575d page)"), // leo1a5
  '/models/community-candidates/type10_x_source.glb': pin('fb6c2aa30119ac45b49fdfb7393a13760109ce4c9cc3f6244e579eb4944879fe'), // type10 (certificate)
  '/models/community-candidates/type89_x_source.glb': pin('8ab1bbbcbde2e6c008a80557cb54409211301df21b86d865b27b4d1adb027566'), // type89 (certificate)
  '/models/community-candidates/type90_x_source.glb': pin('b049dc04744e4bc918dbdd41d59f54d2d05a502084c58b913d777e5c2af92170'), // type90 (certificate)
  '/models/community-candidates/type96b_x_source.glb': pin('ac66370796b83d2d63755390ffdbcaa503d9dbc15726630205c4e44a2765b1ed'), // type96b (certificate)
  '/models/community-candidates/type_74_new.glb': pin('8cd9eb1a915a4bcba402ba86032a6111cdd8c7e1f5cc1698a5fe50bdbd7c726e'), // type74
  '/models/community-candidates/upior_killcapturedestroy.glb': pin('45af347ce1a56bac955645bf8a4bbcd8e67cac744f26d2743412137b936ceb2b'), // upior
  '/models/community-candidates/ztz99a2_manako.glb': pin('862355608ad9d7bf06a622b5ddb63c88f504c8a122020096984f02dc98a92041'), // vt4a1, ztz99a2
  '/models/tanks/char_leclerc_andertan.glb': pin('1ac154e64e0cdd793a293c57692d7a3726607714bdec869b2b4eb6695d896a04',
    "the committed row predates the 10-15 id rename (it measured leclerc); the only version on this machine (archive) and its hash-named sibling 7e8edc38 both score 0 on hull curves, as does the 55ff0b575d page"), // leclerc_s2
  '/models/tanks/community/abramsx-mortavex.glb': pin('441140f2428f0e956df62c73f01bcaa9fb9acf77c08e916707583e91f10fc355'), // abramsx
  '/models/tanks/community/amx30b2_ahab.glb': pin('b84ca94c135db33863fe34b92db47ddcaa38678884266a633f76c34ee33a0f28'), // amx30b2
  '/models/tanks/community/amx30b_ahab.glb': pin('d098e1badf22f856f8d6f4797f8f0e1d9e76a0142cdc9a353bff1eb415787eb0'), // amx30
  '/models/tanks/community/ariete-dustymojito.glb': pin('65e3d75b239686a1d5893eaaf77157efa25e34c959d304ce56e8bd0f8736ef88',
    "the committed row predates the 10-15 id rename (it measured ariete); both versions score 47-62"), // c1_ariete_preserie
  '/models/tanks/community/bmp2_bergman.glb': pin('9a55d18537ab6b9b6bbd625e4ce646634e47c41fc300f7b903816f8f91571f7c',
    "no version reproduces the 08-08 row (82.7): both versions score 60.2, as does the 55ff0b575d page"), // bmp2
  '/models/tanks/community/challenger_3.glb': pin('5eaa24a25e3c200b80ab7d1f8301d2ca8d6aa1fae93b69b79c5d6aed87137940',
    "the committed row predates the 10-15 id rename (it measured challenger_3); both versions score 72"), // challenger3_proto
  '/models/tanks/community/challenger_ii.glb': pin('1be3ef855ac9c441e38262a4ae26600d14c763c70c867024554499a451f9ad48',
    "no version reproduces the 08-10 row (90.1): four versions (lane, archive and two hash-named) score 0 to 23; the 55ff0b575d page gives the same curves"), // challenger2
  '/models/tanks/community/fv510_warrior.glb': pin('d4bcad966b92d0735f0affe65a926502eee9e2a158ff0b35cfe6c443453fa389',
    "the only version on this machine; the 09-12 row scored 0 (whole 7.9), this file whole 80.2"), // fv510
  '/models/tanks/community/m2_bradley_ifv.glb': pin('0d3f779a17a549f7206281331731af4400db7eb1d6907ae6ab7e504cbcfb3d10'), // m2a2_bradley
  '/models/tanks/community/recovered/challenger1.glb': pin('aab22967e5d66d7c122fdb8d7fe83dcc9f43c506d1454af58e30749f91134d27'), // challenger1_mk2
  '/models/tanks/community/recovered/chieftain5.glb': pin('c5d9e375b065e25eb23803608208d201781f3bab5c78b0349f42fd705eeb5f7c'), // chieftain3
  '/models/tanks/community/recovered/leopard2_proto.glb': pin('749d03ae92863ddda0a388501f54c19f7d460a149ab81e230f3e1602e5148fb5'), // leopard2_proto
  '/models/tanks/community/recovered/m46_patton.glb': pin('1dc7d3e2b17e5eee6e3543313135258ff5679b51e95c832cadee52511dd8f2ff'), // m46_patton
  '/models/tanks/community/recovered/m47_patton.glb': pin('aacc768f798c6fc8fa484b5f19ba40d7d568e0965079efdaf6c252182ad6e14e'), // m47_patton
  '/models/tanks/community/recovered/pt91m.glb': pin('fd30b29f3e6a8416e020a9dabb58e639c57db7e513a90291a49cfd8e6c8536d7'), // pt91m
  '/models/tanks/community/recovered/t64bv1.glb': pin('608336f292e7137b085f8ed931617d32d37594c4a0d4059200db1a7d89d4981d'), // t64bv1
  '/models/tanks/community/recovered/t72bu.glb': pin('2957f8938e4e5c897ba680deb2ca986b270bbddb215fcddd52e495b3e4b9608b'), // t72bu_1989
  '/models/tanks/community/recovered/t80.glb': pin('938fad652cae2e527618033ea15006959d90888944329427a8b3341ce65699ed'), // t80
  '/models/tanks/community/recovered/t80b.glb': pin('60b950f0537d6a942f1d8f44033be87897bfaf6356ad32f6603d341d8e062d74'), // t80b
  '/models/tanks/community/recovered/t80bv.glb': pin('ef9e2b7f8b31160db9c47e467caa51a6d157991b1eb7fa6edcb3020ab1e77930'), // t80bv
  '/models/tanks/community/recovered/t84.glb': pin('ebecac128c409a3f2194cc61143f70e23650494e01261e9d168dcdc641181fe8',
    "the main checkout's version (the hash-named archive holds no other); small moves with the build since its pin"), // t84
  '/models/tanks/community/recovered/type90.glb': pin('8ce5a2235d383e6f349026c96356a5931703ece7b04ae49f5f43f7c432e87e3f'), // type90_kyumaru
  '/models/tanks/community/spz_puma.glb': pin('9714eacccee26d9c4d30b3f8e10e13a5c19aa139784df1f79a15c6c4e2dee4a4'), // spz_puma
  '/models/tanks/community/t-72b3m_obr._2022.glb': pin('6ee260f31911b1c60feab24999dfa30467cc1b5c8c5ff6ecf787ddd590e9f350'), // t72b3m_2022
  '/models/tanks/community/type-10_main_battle_tank_repaired.glb': pin('c3753b826975fc6eb9968be4343e0cb5a761f166c4d39ff6254374ae3475f485'), // type10_tk_x
  '/models/tanks/community/vickers_mk1_jack.glb': pin('5b22ea067ca5afbc1bf7ac4782523aad0c83dae603c6623d187f2575294d6b72',
    "the only version on this machine (archive, hash-named); it does not reproduce the 08-06 row (81.8 -> 35.5)"), // vickers_mk1
  '/models/tanks/kf51_grip420.glb': pin('439baa6f36257a0bd68d0a2a7aead367b133ff1585d3d03ea30b619155ef0d34',
    "the committed row predates the 10-15 id rename (it measured kf51); the only version (archive, hash-named)"), // kf51_evo, kf51_u
  '/models/tanks/t80u_javanilga.glb': pin('c72aaad17def71d8b9484a87a33683302c3949b4a23aef132d6445d59248acca',
    "the committed row predates the 10-15 id rename (it measured t80u); both versions (lane, hash-named d8013870) score 0-5"), // t80uk
});
