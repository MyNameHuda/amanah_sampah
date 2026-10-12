import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { LoadingButton } from '../components/LoadingButton';
import { consumeLogoutReason, REASON_SUSPENDED, REASON_EXPIRED } from '../api/client';
import {
  LogIn,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  TriangleAlert,
  Recycle,
  Info,
  GraduationCap,
  UserCog,
  ClipboardCheck,
  ShoppingBasket,
  Settings2,
} from 'lucide-react';

type Identity = 'siswa' | 'staff';

interface IdentityMeta {
  label: string;
  field: string;
  hint: string;
  placeholder: string;
  mono: boolean;
  inputMode: 'numeric' | 'email';
  
  Icon: ComponentType<{ className?: string }>;
}

const IDENTITIES: Record<Identity, IdentityMeta> = {
  siswa: {
    label: 'Siswa',
    field: 'NIS',
    hint: 'Nomor induk yang terdaftar di sekolah',
    placeholder: '23001',
    mono: true,
    inputMode: 'numeric',
    Icon: GraduationCap,
  },
  staff: {
    label: 'Staff',
    field: 'Email',
    hint: 'Email yang diberikan admin sekolah',
    placeholder: 'nama@sekolah.id',
    mono: false,
    inputMode: 'email',
    Icon: UserCog,
  },
};

const IDENTITIES_ORDER: Identity[] = ['siswa', 'staff'];

/**
 * Tiga langkah sistem, ditampilkan apa adanya di panel kiri.
 * Penomoran di sini bukan hiasan — urutan ini memang urutan riil di aplikasi:
 * tidak bisa dapat poin sebelum langkah 02 selesai.
 */
const FLOW: Array<{ n: string; title: string; desc: string }> = [
  { n: '01', title: 'Setor', desc: 'Bawa plastik ke pos sampah' },
  { n: '02', title: 'Verifikasi', desc: 'Petugas memastikan jumlah dan jenisnya' },
  { n: '03', title: 'Tukar', desc: 'Poin dipakai di kantin atau reward' },
];

/**
 * Untuk siapa aplikasi ini — disusun dari role yang benar-benar ada di
 * `src/server/auth/roles.ts`, bukan role karangan. Deskripsi tiap role
 * diambil dari kapabilitas yang memang granted ke role itu di
 * `CAPABILITIES` (petugas: input_verifikasi + kelola_siswa; staff_kantin:
 * kelola_pembelian; admin_kesantrian: katalog + reward + akun).
 *
 * Ini bukan hiasan: di halaman login, pertanyaan pertama user adalah
 * "akun saya yang mana ya", dan daftar ini menjawabnya sebelum user
 * perlu menebak dari bentuk form.
 */
const AUDIENCE: Array<{
  title: string;
  desc: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  {
    Icon: GraduationCap,
    title: 'Siswa',
    desc: 'Menyetor plastik, mengumpulkan poin, lalu menukarnya di kantin.',
  },
  {
    Icon: ClipboardCheck,
    title: 'Petugas Kesantrian',
    desc: 'Memverifikasi setiap setoran dan mengelola data siswa.',
  },
  {
    Icon: ShoppingBasket,
    title: 'Staff Kantin',
    desc: 'Memproses pembelian yang dibayar dengan poin.',
  },
  {
    Icon: Settings2,
    title: 'Admin Kesantrian',
    desc: 'Mengelola katalog produk, reward, dan akun pengguna.',
  },
];

/** Grain film sebagai data-URI — tanpa request jaringan, ~250 byte. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Watermark ilustrasi: botol → verifikasi → poin.
 * SVG inline, stroke=currentColor supaya mengikuti warna teks panel.
 * Dipakai sebagai background dekoratif di belakang statement — opacity
 * rendah, kontur saja, supaya cerita "deposit jadi poin" terbaca tanpa
 * bersaing dengan teks.
 */
function FlowIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Botol plastik */}
      <g transform="translate(20, 10)">
        <rect x="22" y="0" width="16" height="10" rx="2" />
        <rect x="24" y="10" width="12" height="14" rx="1" />
        <path d="M 24 24 Q 8 28 6 44 L 6 96 Q 6 104 14 104 L 46 104 Q 54 104 54 96 L 54 44 Q 52 28 36 24" />
        <line x1="8" y1="56" x2="52" y2="56" />
        <line x1="8" y1="68" x2="52" y2="68" strokeWidth="1" />
        <line x1="8" y1="80" x2="52" y2="80" strokeWidth="1" />
        <path d="M 18 12 Q 22 14 26 12" strokeWidth="1" />
      </g>

      {/* Panah ke verifikasi */}
      <g transform="translate(96, 60)">
        <line x1="0" y1="0" x2="140" y2="0" strokeDasharray="3 6" />
        <path d="M 138 -7 L 152 0 L 138 7" />
      </g>

      {/* Tanda verifikasi kecil */}
      <g transform="translate(184, 48)">
        <circle cx="12" cy="12" r="11" />
        <path d="M 7 12 L 11 16 L 18 8" strokeWidth="2" />
      </g>

      {/* Panah ke koin */}
      <g transform="translate(216, 60)">
        <line x1="0" y1="0" x2="36" y2="0" strokeDasharray="3 6" />
        <path d="M 34 -7 L 48 0 L 34 7" />
      </g>

      {/* Koin/poin */}
      <g transform="translate(276, 16)">
        <circle cx="44" cy="44" r="44" />
        <circle cx="44" cy="44" r="36" strokeWidth="1" />
        <text
          x="44"
          y="55"
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize="38"
          fontWeight="700"
          fill="currentColor"
          stroke="none"
        >
          P
        </text>
      </g>
    </svg>
  );
}

/**
 * Tiga langkah sistem, dalam dua warna.
 *
 * `dark` dipakai di panel foto, `light` di bawah kartu form. Satu markup
 * untuk dua tempat — kalau hanya menyalin mark-up-nya, perbaikan teks atau
 * urutan nanti hanya berlaku di salah satu tempat.
 *
 * Tata letaknya responsif dalam satu DOM: vertikal di layar sempit, tiga
 * kolom di layar lebar. Dua elemen terpisah dengan `sm:hidden`/`hidden sm:`
 * akan membacakan isi yang sama dua kali ke screen reader.
 *
 * Garis penghubung di belakang nomor bukan dekorasi: tanpa itu ketiga
 * langkah terbaca sebagai daftar fitur yang setara, dengan garis ia
 * terbaca sebagai satu rangkaian. Urutannya pun riil, bukan hiasan.
 */
function FlowSteps({
  tone,
  className = '',
  animate = false,
}: {
  tone: 'dark' | 'light';
  className?: string;
  animate?: boolean;
}) {
  const isDark = tone === 'dark';
  return (
    <ol className={`grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3 ${className}`}>
      {FLOW.map((step, i) => (
        <li
          key={step.n}
          className={`relative min-w-0 sm:block ${animate ? 'animate-reveal-up motion-reduce:animate-none' : ''}`}
          style={animate ? { animationDelay: `${200 + i * 100}ms` } : undefined}
        >
          {/* Konektor hanya bermakna di tata letak vertikal. */}
          {i < FLOW.length - 1 && (
            <span
              aria-hidden="true"
              className={`absolute left-2.5 top-6 -bottom-5 w-px bg-gradient-to-b to-transparent sm:hidden ${
                isDark ? 'from-white/25' : 'from-slate-300'
              }`}
            />
          )}
          <div className="flex gap-3 sm:block">
            <span
              className={`relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-mono tabular-nums ring-1 ring-inset ${
                isDark
                  ? 'bg-[#0B2416] text-brand-200 ring-white/20'
                  : 'bg-white text-slate-500 ring-slate-300'
              }`}
            >
              {step.n}
            </span>
            <div className="min-w-0 sm:mt-2.5">
              <span className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                {step.title}
              </span>
              <span className={`mt-0.5 block text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                {step.desc}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Daftar role yang memakai aplikasi ini. Ditaruh di panel kiri supaya
 * panel itu membawa informasi, bukan cuma foto dan kalimat besar — dan
 * menjawab pertanyaan paling pertama yang muncul di depan halaman login:
 * akun saya yang mana.
 */
function AudienceList({ tone }: { tone: 'dark' | 'light' }) {
  const isDark = tone === 'dark';
  return (
    <ul className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
      {AUDIENCE.map(({ Icon, title, desc }) => (
        <li key={title} className="flex min-w-0 items-start gap-3">
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              isDark
                ? 'bg-white/10 text-brand-200 ring-1 ring-inset ring-white/10'
                : 'bg-white text-brand-600 ring-1 ring-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
              {title}
            </span>
            <span className={`mt-0.5 block text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
              {desc}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Login() {
  const { login, loading } = useAuth();
  const toast = useToast();
  const [identity, setIdentity] = useState<Identity>('siswa');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginIdRef = useRef<HTMLInputElement>(null);
  const loginIdId = useId();
  const passwordId = useId();
  const errorId = useId();

  const meta = IDENTITIES[identity];
  const IdentityIcon = meta.Icon;

  useEffect(() => {
    const t = setTimeout(() => loginIdRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Sesi bisa terputus karena dua alasan yang perlu dibedakan oleh user:
  // token dicabut admin (suspended), atau token sekadar kedaluwarsa. Tanpa
  // ini, user tiba-tiba menemukan form login kosong tanpa penjelasan.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('suspended') === '1'
      ? REASON_SUSPENDED
      : consumeLogoutReason();

    if (reason === REASON_SUSPENDED) {
      setError('Akun Anda di-suspend. Hubungi admin sekolah untuk membuka akses kembali.');
    } else if (reason === REASON_EXPIRED) {
      setError('Sesi Anda berakhir. Silakan masuk kembali.');
    }
    // Bersihkan query supaya refresh tidak memunculkan banner yang sama lagi.
    if (params.has('suspended') || params.has('expired')) {
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  function switchIdentity(next: Identity) {
    if (next === identity) return;
    setIdentity(next);
    setError(null);
    // Fokus sengaja TIDAK dipindahkan ke field. Kalau dipindah, pengguna
    // keyboard kehilangan kemampuan memindah pilihan dengan tombol panah —
    // fokus terkunci di input, dan panah hanya akan menggeser kursor teks.
  }

  /**
   * Caps Lock adalah penyebab kegagalan login paling sering di aplikasi yang
   * dipakai berulang: petugas mengetik password di kantin, Caps menyala, tiga
   * percobaan gagal, lalu ia mengira passwordnya salah. Deteksi ini membuat
   * masalahnya terlihat sebelum tombol ditekan.
   */
  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!loginId.trim() || !password) {
      setError(`${meta.field} dan password wajib diisi.`);
      loginIdRef.current?.focus();
      return;
    }

    try {
      await login(loginId.trim(), password, rememberMe);
      toast.success('Berhasil masuk.');
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.login?.[0] ||
        'Tidak bisa masuk. Periksa kembali data Anda.';
      setError(msg);
      // Password dikosongkan setelah gagal: perangkat ini dipakai bersama
      // (tablet kantin), jadi password yang gagal tidak boleh tertinggal di
      // layar untuk dibaca orang berikutnya.
      setPassword('');
    }
  }

  return (
    /* md:h-screen + md:overflow-hidden — panel kiri dikunci pas setinggi
       layar sehingga halaman tidak pernah tumbuh sendiri. Yang boleh
       bergerak hanya kolom form (lihat catatan di main).

       `min-h-screen` tetap jadi dasarnya supaya di mobile — yang panel
       kirinya `hidden` — scroll tetap mengikuti halaman seperti biasa.

       Dulu hanya `min-h-screen`: di layar pendek (~895px) konten login yang
       ~1000px memaksa halaman scroll, dan karena grid meregangkan dua kolom
       ke tinggi yang sama, panel kiri ikut meninggi. Efeknya `my-auto` di
       panel kiri memusatkan diri terhadap kotak 1000px, bukan terhadap layar. */
    <div className="min-h-screen bg-slate-50 md:grid md:grid-cols-[1.05fr_1fr] md:h-screen md:overflow-hidden">
      {/* ─── Panel kiri: identitas sekolah ─── */}
      {/* Panel ini dulu disembunyikan penuh dari screen reader karena
          isinya murni dekorasi. Sekarang isinya membawa informasi (daftar
          role), jadi aria-hidden dipindah ke elemen dekoratifnya satu per
          satu — foto, blob, gradasi, grain. Teksnya harus ikutDibaca. */}
      <aside
        className="relative isolate hidden md:flex md:flex-col overflow-hidden bg-[#0F2E1D] text-white"
      >
        {/* Cahaya ambient. Foto memberi warna, tapi foto datar — dua blob
            blur yang bergerak sangat lambat memberi kedalaman dan menjaga
            panel dari kesan "gambar header yang di-zoom". Delay negatif
            supaya keduanya tidak bergerak berbaris, terlihat organik. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-28 -top-36 h-[36rem] w-[36rem] rounded-full bg-emerald-400/20 blur-3xl animate-drift motion-reduce:animate-none" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-1/4 h-[30rem] w-[30rem] rounded-full bg-lime-200/10 blur-3xl animate-drift motion-reduce:animate-none"
          style={{ animationDelay: '-9s' }}
        />

        {/* Duotone: gambar dibuat abu-abu lalu dipoles warna hijau hutan lewat
            mix-blend-luminosity. Hasilnya foto menyatu dengan panel, bukan
            foto stock yang ditempel filter gelap. */}
        <img
          src="/bg-pesantren.webp"
          alt=""
          width="1280"
          height="720"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover opacity-55 mix-blend-luminosity"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        {/* Overlay gradasi untuk keterbacaan teks */}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0B2416] via-[#0B2416]/80 to-[#0B2416]/35" />
        {/* Vignette: meredupkan tepi panel supaya sudut tidak terang — di
            sudut atas-lah foto paling terang, dan paling bertabrakan dengan
            logo putih. Tanpa ini, kontras paling tinggi justru jatuh di
            tempat paling butuh tenang. */}
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_45%,rgb(4_20_12/0.55)_100%)]" />
        {/* Grain — memecah gradasi rata agar tidak terlihat seperti template */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07] mix-blend-overlay"
          style={{ backgroundImage: GRAIN, backgroundRepeat: 'repeat' }}
        />

        <div className="relative z-10 flex flex-col h-full p-10 lg:p-12">
          <div className="flex items-center gap-3 animate-reveal-up motion-reduce:animate-none">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgb(0_0_0/0.18)]">
              <img
                src="/logo-pesantren.webp"
                alt=""
                width="28"
                height="28"
                loading="eager"
                className="w-7 h-7 object-contain"
              />
            </div>
            <p className="text-sm font-semibold tracking-tight">Amanah Sampah</p>
          </div>

          {/* Blok tengah (statement + alur) diberi my-auto supaya sisa
              tinggi panel dibagi rata di ATAS dan BAWAH. Sebelumnya alur
              dijejakkan ke dasar dengan mt-auto, yang menumpuk semua sisa
              ruang ke satu sisi — di 1920x1080 itu rongga kosong setinggi
              400px tepat di bawah konten. */}
          <div className="my-auto">
            <div
              className="relative max-w-md animate-reveal-up motion-reduce:animate-none"
              style={{ animationDelay: '90ms' }}
            >
              <FlowIllustration className="absolute -top-10 -right-6 lg:-right-10 w-[360px] h-auto text-white opacity-[0.08] pointer-events-none" />
              {/* Batang aksen membentang setinggi blok, bukan setinggi
                  headline saja — kalau tinggi tetap, tambahan paragraf di
                  bawahnya terlihat seperti blok yang belum beres. */}
              <div className="relative flex gap-4">
                <span aria-hidden="true" className="w-1 shrink-0 my-1 bg-brand-400 rounded-sm" />
                <div className="min-w-0">
                  <h2 className="relative text-2xl lg:text-[2.5rem] font-semibold leading-[1.15] tracking-[-0.025em]">
                    Setiap botol plastik yang dikumpulkan berhitung jadi poin.
                  </h2>
                  {/* Paragraf pendukung. Headline-nya sendiri cuma satu
                      kalimat, dan di panel setinggi layar penuh satu
                      kalimat saja menyisakan rongga besar tanpa konteks. */}
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/65">
                    Plastik yang dibawa ke pos sampah dicek petugas, lalu
                    ditukar jadi poin yang bisa dibelanjakan di kantin atau
                    ditukar dengan reward.
                  </p>
                </div>
              </div>
            </div>

            {/* Daftar role, bukan alur. Alur "Setor → Verifikasi → Tukar"
                dipindah ke bawah kartu form: di panel foto isinya terbaca
                sebagai konten, sedangkan di bawah form isinya menjawab
                pertanyaan "abis masuk ke mana". Dua-duanya sekali tampil. */}
            <div className="mt-12 max-w-lg">
              <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.08em] text-white/45">
                Untuk siapa aplikasi ini
              </p>
              <AudienceList tone="dark" />
            </div>
          </div>

          <div
            className="pt-10 border-t border-white/15 flex items-center justify-between text-[11px] tracking-wide text-white/50 animate-reveal-up motion-reduce:animate-none"
            style={{ animationDelay: '500ms' }}
          >
            <span>Pesantren Minhaj Shahabah</span>
            <span>Bogor</span>
          </div>
        </div>
      </aside>

      {/* ─── Panel kanan: form ─── */}
      {/* md:overflow-y-auto — satu-satunya elemen yang boleh scroll. Di md ke
          atas parent-nya dikunci md:h-screen, jadi halaman tidak bergerak;
          hanya kolom ini yang bergeser kalau form + "Cara kerjanya" lebih
          tinggi dari viewport. Di bawah md parent-nya cuma min-h-screen,
          jadi scroll tetap mengikuti halaman (perilaku normal mobile).

          scrollbar-thin dipakai supaya scrollbar-nya 8px abu-abu seperti
          container lain di app ini, bukan scrollbar gelap default browser
          yang floats di tengah layar. */}
      <main className="flex flex-col bg-slate-50 md:h-screen md:overflow-y-auto scrollbar-thin">
        <div className="relative flex-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-10">
          {/* Cahaya di belakang kartu — gradasinya didefinisikan di index.css */}
          <div aria-hidden="true" className="login-aura pointer-events-none absolute inset-0" />

          <div className="relative w-full max-w-sm sm:max-w-md lg:max-w-lg">
            {/* Brand — hanya di mobile, karena di desktop ada di panel kiri.
                Sengaja di LUAR kartu: di mobile kartu sudah sempit, dan
                logo yang ikut masuk ke dalamnya akan terasa seperti bagian
                dari form, bukan identitas halaman. */}
            <div className="md:hidden mb-6 flex items-center gap-3 animate-reveal-up motion-reduce:animate-none">
              <div className="w-11 h-11 bg-white rounded-xl ring-1 ring-slate-200 flex items-center justify-center shrink-0">
                <img
                  src="/logo-pesantren.webp"
                  alt="Logo Pesantren Minhaj Shahabah"
                  width="28"
                  height="28"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-slate-900">Amanah Sampah</p>
                <p className="text-xs text-slate-500">Pesantren Minhaj Shahabah</p>
              </div>
            </div>

            {/* Statement. Di panel foto versi ini sudah ada, jadi di sini
                hanya untuk layout satu kolom — tanpa ini, layar yang lebar
                tapi di bawah 768px hanya punya satu kartu kecil yang
                melayang di ruang kosong, tanpa ada yang menyebut aplikasi
                ini apa. */}
            <div className="md:hidden mb-6 animate-reveal-up motion-reduce:animate-none">
              <h2 className="text-2xl font-semibold leading-[1.2] tracking-[-0.025em] text-slate-900">
                Setiap botol plastik yang dikumpulkan berhitung jadi poin.
              </h2>
            </div>

            <div className="login-card p-6 sm:p-8 animate-zoom-fade-in motion-reduce:animate-none">
              <header className="mb-6">
                <h1 className="text-[1.375rem] leading-tight font-semibold text-slate-900 tracking-[-0.02em]">
                  Masuk
                </h1>
                <p className="text-sm text-slate-500 mt-1.5">
                  Gunakan akun yang terdaftar di sekolah.
                </p>
              </header>

              {/* Pemilih identitas — menjelaskan field mana yang dipakai.
                  Memakai <input type="radio"> asli, bukan role="tab": radio
                  memberi semantik yang benar dan navigasi tombol panah gratis
                  dari browser, sementara role="tab" mengharuskan tabpanel +
                  handler panah sendiri.

                  Pil putih TIDAK ikut di-mount ulang saat tab berganti, tapi
                  hanya digeser lewat transform. Kalau di-mount ulang, tiap
                  perpindahan akan terasa seperti "konten berubah" — hilang
                  jejak bahwa dua opsi ini satu kontrol yang sama. */}
              <fieldset className="mb-6">
                <legend className="sr-only">Jenis akun</legend>
                <div className="relative grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/70">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-1 left-1 w-[calc(50%_-_6px)] rounded-lg bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_2px_8px_-2px_rgb(15_23_42/0.10)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      identity === 'staff' ? 'translate-x-[calc(100%_+_0.25rem)]' : 'translate-x-0'
                    }`}
                  />
                  {IDENTITIES_ORDER.map((key) => {
                    const active = identity === key;
                    const { Icon } = IDENTITIES[key];
                    return (
                      <label
                        key={key}
                        className={`touch-target relative flex cursor-pointer items-center justify-center rounded-lg py-1.5 text-sm font-medium transition-colors duration-200 ${
                          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="identity"
                          value={key}
                          checked={active}
                          onChange={() => switchIdentity(key)}
                          className="peer sr-only"
                        />
                        <span className="pointer-events-none flex items-center justify-center gap-2 rounded-lg peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-100">
                          <Icon
                            className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                              active ? 'text-brand-600' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                          {IDENTITIES[key].label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <form onSubmit={submit} noValidate className="space-y-4">
                {error && (
                  <div
                    id={errorId}
                    role="alert"
                    className="animate-shake relative overflow-hidden rounded-xl bg-red-50 ring-1 ring-red-200/80"
                  >
                    {/* Aksen batang kiri. Pesan error bisa beberapa baris
                        (mis. daftar field dari backend) dan bar penanda di
                        tepi kiri jauh lebih cepat ditemukan daripada blok
                        merah penuh yang bentuknya sama dengan panel sukses. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1 bg-red-500/80"
                    />
                    <div className="flex items-start gap-2.5 py-3 pl-4 pr-3.5">
                      <AlertCircle
                        className="w-4 h-4 shrink-0 mt-0.5 text-red-600"
                        aria-hidden="true"
                      />
                      <span className="text-sm text-red-800 leading-relaxed">{error}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor={loginIdId} className="block text-[13px] font-medium text-slate-700 mb-1.5">
                    {meta.field}
                  </label>
                  <div className="relative">
                    {/* Input ditulis SEBELUM ikon supaya ikon bisa pakai
                        varian `peer-*`: peer harus mendahului elemen yang
                        bereaksi. Urutan visual tetap ikon di kiri karena
                        posisinya absolut. */}
                    <input
                      ref={loginIdRef}
                      id={loginIdId}
                      name="login"
                      type="text"
                      autoComplete="username"
                      inputMode={meta.inputMode}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      /* text-[16px] di mobile: iOS Safari auto-zoom kalau font
                         input < 16px, dan zoom-nya tidak kembali sendiri setelah
                         blur. sm:text-sm mengembalikan 14px di desktop. */
                      className={`peer w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-[16px] leading-6 text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15 sm:text-sm ${
                        meta.mono ? 'font-mono tracking-wide' : ''
                      }`}
                      value={loginId}
                      onChange={(e) => { setLoginId(e.target.value); setError(null); }}
                      placeholder={meta.placeholder}
                      required
                      aria-describedby={error ? errorId : undefined}
                      aria-invalid={!!error || undefined}
                    />
                    <IdentityIcon
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-slate-400 transition-colors duration-200 peer-focus:text-brand-600"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{meta.hint}</p>
                </div>

                <div>
                  <label htmlFor={passwordId} className="block text-[13px] font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id={passwordId}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      spellCheck={false}
                      className="peer w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-12 text-[16px] leading-6 text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15 sm:text-sm"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      onKeyDown={trackCaps}
                      onKeyUp={trackCaps}
                      onBlur={() => setCapsOn(false)}
                      required
                      aria-describedby={capsOn ? `${passwordId}-caps` : error ? errorId : undefined}
                      aria-invalid={!!error || undefined}
                    />
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-slate-400 transition-colors duration-200 peer-focus:text-brand-600"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      aria-pressed={showPassword}
                      className="touch-target absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
                      ) : (
                        <Eye className="w-[1.125rem] h-[1.125rem]" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {capsOn && (
                    <p
                      id={`${passwordId}-caps`}
                      className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"
                    >
                      <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      Caps Lock menyala.
                    </p>
                  )}
                </div>

                {/* Baris "ingat saya": label membungkus checkbox + teks, jadi
                    area ketukannya jauh lebih luas daripada kotak 16px-nya. */}
                <div className="-ml-2">
                  <label
                    htmlFor="remember"
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1 pl-2 pr-2 -my-1 transition-colors hover:bg-slate-100"
                  >
                    <input
                      id="remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-200 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-sm text-slate-700">Ingat saya selama 7 hari</span>
                  </label>
                </div>

                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText="Memproses..."
                  className="w-full mt-1 rounded-xl py-3 text-[15px] bg-gradient-to-b from-brand-500 to-brand-700 shadow-[0_1px_2px_rgb(15_23_42/0.08),0_8px_20px_-10px_rgb(22_163_74/0.9)] hover:from-brand-500 hover:to-brand-700"
                  variant="primary"
                >
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  Masuk
                </LoadingButton>
              </form>

              <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-200/80">
                <Info className="mt-px w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-slate-500">
                  Tidak bisa masuk? Hubungi{' '}
                  <span className="font-medium text-slate-700">admin sekolah</span> — kedua
                  jenis akun dibuat oleh mereka.
                </p>
              </div>
            </div>

            {/* Alur tiga langkah. Tampil di semua ukuran, bukan hanya saat
                layout satu kolom: di desktop panel kiri sudah diisi daftar
                role, jadi ini yang mengisi sisa ruang di panel form —
                dan menjawab "abis masuk ke mana" sebelum user menekan
                tombol. */}
            <div className="mt-8 animate-reveal-up motion-reduce:animate-none">
              <p className="mb-5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                Cara kerjanya
              </p>
              <FlowSteps tone="light" />
            </div>
          </div>
        </div>

        <footer className="px-5 sm:px-8 py-5 text-center text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Recycle className="w-3.5 h-3.5" aria-hidden="true" />
            Amanah Sampah
          </span>
        </footer>
      </main>
    </div>
  );
}
