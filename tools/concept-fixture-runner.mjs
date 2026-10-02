// A family fixture validates its complete family. Share identical invocations
// within one check process only, while the complete input digest stays frozen.
export function createConceptFixtureRunner(execute, digest) {
  const results = new Map();
  let invocation = 0;
  return (testPath, inputSha256) => {
    const key = JSON.stringify([testPath, inputSha256]);
    if (results.has(key)) return {...results.get(key), reused: true};
    const child = execute(testPath);
    const result = {...child, invocation: ++invocation,
      inputsStable: digest() === inputSha256};
    if (result.inputsStable) results.set(key, result);
    return {...result, reused: false};
  };
}

// One immutable revision per checker, including work between vehicle checks.
export function createConceptInputGuard(digest) {
  const baseline=digest();
  return {baseline,assertCurrent() {
    const current=digest();
    if(current!==baseline)throw new Error('Concept inputs changed from the process startup revision');
    return current;
  }};
}
