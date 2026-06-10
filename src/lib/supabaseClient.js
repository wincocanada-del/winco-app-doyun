import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error('Supabase 환경변수가 없습니다. .env 설정 후 dev 서버를 재시작하세요.');
}

export const supabase = createClient(url, anon);
