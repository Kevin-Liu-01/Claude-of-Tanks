import { inject } from '@vercel/analytics';

inject({
  mode: import.meta.env.PROD ? 'production' : 'development',
});
