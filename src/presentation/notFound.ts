import { getLocale, t } from '../ui/i18n.ts';
import { installResponsiveLayout } from '../ui/responsiveLayout.ts';
import { localizeDocumentLinks, synchronizeLocaleRoute } from '../ui/localeRouting.ts';
import { bindStaticI18nAuto } from './staticI18n.ts';

installResponsiveLayout();

const locale = getLocale();
const localeRouteChanged = synchronizeLocaleRoute(locale);
if (!localeRouteChanged) {
  bindStaticI18nAuto();
  localizeDocumentLinks(document, locale);
}

document.title = t('notFound.metaTitle');
document.querySelector<HTMLMetaElement>('meta[name="description"]')
  ?.setAttribute('content', t('notFound.metaDescription'));
