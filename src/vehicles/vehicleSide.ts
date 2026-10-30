/**
 * The vehicle's lateral convention, owned here and nowhere else (266). Forward is +Z and up +Y, and a positive hull
 * yaw turns the nose to the vehicle's left (src/game/playerFrameInput.ts maps the D/right action to a negative steer),
 * so +X is the vehicle's LEFT and -X its RIGHT. The drawn models agree: the M1A2's loader's M240 sits at x +0.9 and
 * the commander's M2 at -0.51; the Leopard 2A6's EMES-15 and PERI at -0.3 to -0.7.
 *
 * A crew station named ...Left (internalLayoutRegistry.ts) therefore sits at +x and ...Right at -x, in its own frame
 * (the hull's centreline, or the turret's yaw axis). The track modules keep their legacy names: `trackL` is the -x
 * track in the hit model and the drawn gear alike.
 */
const LEFT_X_SIGN = 1;

/** The x sign of a named station's side: +1 for ...Left, -1 for ...Right, 0 for a centre station. */
export function stationSideSign(station: string | null | undefined): -1 | 0 | 1 {
  if (/Left$/.test(station || '')) return LEFT_X_SIGN;
  if (/Right$/.test(station || '')) return -LEFT_X_SIGN as -1;
  return 0;
}
