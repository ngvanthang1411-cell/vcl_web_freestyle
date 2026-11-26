/**
 * The Bars Challenge word bank.
 *
 * Words are grouped by theme so that "Sequential" mode can walk a coherent
 * theme (a verse's worth of vocabulary) while "Random" mode mixes the whole
 * bank.
 *
 * Each language has its own bank. When the user switches language mid-session
 * the word set changes, which is intended — the challenge is played in the
 * language you chose.
 */

export const WORD_BANK = {
  en: [
    // Street & city
    'Hustle', 'Microphone', 'Streetlights', 'Concrete', 'Corner Store', 'Payphone',
    'Subway', 'Rooftop', 'Fire Escape', 'Sidewalk', 'Downtown', 'Headlights',
    'Backseat', 'Corner Shop', 'Bus Stop', 'Neon Sign', 'Parking Garage',

    // Money & grind
    'Grind', 'Rent', 'Overtime', 'Paycheck', 'Broker', 'Portfolio', 'Invoice',
    'Deadline', 'Cents', 'Bankroll', 'Taxes', 'Wire Transfer',

    // Sound & studio
    'Frequency', 'Sample', 'Hook', 'Verse', 'Cadence', 'Bars', 'Echo Chamber',
    'Booth', 'Mixdown', 'Crate', 'Vinyl', 'Amp', 'Reverb',

    // Attitude
    'Grit', 'Swagger', 'Fame', 'Legacy', 'Pressure', 'Composure',
    'Ambition', 'Patience', 'Reputation', 'Instinct',

    // Late night
    'Dawn', 'Midnight', 'After Hours', 'Quiet', 'Insomnia', 'Sunrise',
    'Porch Light', 'Neon',
  ],

  vi: [
    // Đường phố & thành phố
    'Hustle', 'Micrô', 'Đèn đường', 'Bê tông', 'Cửa hàng', 'Công thức',
    'Tàu điện ngầm', 'Mái nhà', 'Lối thoát hiểm', 'Vỉa hè', 'Trung tâm',
    'Đèn pha', 'Ghế sau', 'Quán góc phố', 'Điểm xe buýt', 'Bảng neon',
    'Nhà để xe',

    // Tiền bạc & chăm chỉ
    'Cày', 'Tiền thuê', 'Làm thêm', 'Lương', 'Môi giới', 'Danh mục',
    'Hóa đơn', 'Hạn chót', 'Xu', 'Gói tiền', 'Thuế', 'Chuyển khoản',

    // Âm thanh & phòng thu
    'Tần số', 'Sample', 'Hook', 'Verse', 'Nhịp', 'Câu rap', 'Vang dội',
    'Buồng thu', 'Mix', 'Thùng đĩa', 'Vinyl', 'Loa', 'Reverb',

    // Thái độ
    'Bản lĩnh', 'Swagger', 'Danh tiếng', 'Di sản', 'Áp lực', 'Bình tĩnh',
    'Khát vọng', 'Kiên nhẫn', 'Uy tín', 'Bản năng',

    // Khuya
    'Bình minh', 'Nửa đêm', 'Giờ khuya', 'Yên tĩnh', 'Mất ngủ', 'Bình minh',
    'Đèn hiên', 'Neon',
  ],
};

/** Deduplicated but order-preserving, for sequential mode. */
export function sequentialWords(locale) {
  const bank = WORD_BANK[locale] ?? WORD_BANK.en;
  return Array.from(new Set(bank));
}

export const DEFAULT_WORD = 'FLOW';
