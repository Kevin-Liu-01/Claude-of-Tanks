// Official country flags from lipis/flag-icons. Importing individual 4x3
// assets keeps Vite's output limited to the nations the roster actually uses
// instead of shipping the package's complete flag catalog and global CSS.

import cn from 'flag-icons/flags/4x3/cn.svg?url';
import de from 'flag-icons/flags/4x3/de.svg?url';
import fr from 'flag-icons/flags/4x3/fr.svg?url';
import gb from 'flag-icons/flags/4x3/gb.svg?url';
import il from 'flag-icons/flags/4x3/il.svg?url';
import it from 'flag-icons/flags/4x3/it.svg?url';
import jp from 'flag-icons/flags/4x3/jp.svg?url';
import kr from 'flag-icons/flags/4x3/kr.svg?url';
import pl from 'flag-icons/flags/4x3/pl.svg?url';
import ru from 'flag-icons/flags/4x3/ru.svg?url';
import se from 'flag-icons/flags/4x3/se.svg?url';
import ua from 'flag-icons/flags/4x3/ua.svg?url';
import us from 'flag-icons/flags/4x3/us.svg?url';
import xx from 'flag-icons/flags/4x3/xx.svg?url';
import { flagIconCode } from './flagCodes.js';

const FLAG_URL = Object.freeze({ cn, de, fr, gb, il, it, jp, kr, pl, ru, se, ua, us, xx });

/** Bundled official flag URL for CSS backgrounds and image elements. */
export function flagIconUrl(nation) {
  return FLAG_URL[flagIconCode(nation)];
}

/**
 * Render the official flag-icons asset for a roster nation.
 * The adjacent garage text already names the nation, so the image is
 * deliberately decorative and hidden from assistive technology.
 */
export function flagIconHTML(nation, width = 24, height = 0) {
  const code = flagIconCode(nation);
  const w = Number.isFinite(width) && width > 0 ? Math.round(width) : 24;
  const h = Number.isFinite(height) && height > 0 ? Math.round(height) : Math.round(w * 0.75);
  return `<img class="cot-flag" src="${flagIconUrl(nation)}" width="${w}" height="${h}" ` +
    `data-country-code="${code}" alt="" aria-hidden="true" draggable="false">`;
}
