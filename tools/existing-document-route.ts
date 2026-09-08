import {realpathSync, statSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';

/** Only real HTML files inside the server's actual document root bypass 404.
 * Dev uses the project root; preview uses the built output, not source files.
 * Never infer existence from an extension or allow a symlink outside the root.
 */
export function isExistingProjectDocument(pathname: string, documentRoot: string): boolean {
  try {
    const decoded=decodeURIComponent(pathname);
    if(!decoded.startsWith('/')||decoded.startsWith('//')||!decoded.endsWith('.html')
      ||decoded.includes('\\')||decoded.includes('\0'))return false;
    const root=realpathSync(documentRoot),file=resolve(root,decoded.slice(1));
    const inside=(candidate:string)=>{
      const child=relative(root,candidate);
      return child!==''&&child!=='..'&&!child.startsWith(`..${sep}`)&&!isAbsolute(child);
    };
    return inside(file)&&inside(realpathSync(file))&&statSync(file).isFile();
  }catch{return false;}
}
