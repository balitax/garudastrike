import { GameStats } from '../types';

// Replaced AI generation with static local logic
export const generateMissionDebrief = async (stats: GameStats): Promise<string> => {
  // Simulate a short delay for dramatic effect (optional, can be removed)
  await new Promise(resolve => setTimeout(resolve, 500));

  if (stats.score < 1000) {
    return "Skor rendah. Kembali ke akademi penerbangan untuk latihan simulasi dasar, Pilot.";
  } else if (stats.score < 3000) {
    return "Misi selesai. Refleks cukup baik, namun akurasi penembakan perlu ditingkatkan.";
  } else if (stats.score < 6000) {
    return "Kerja bagus, Pilot. Anda berhasil menahan gelombang serangan musuh dengan efektif.";
  } else {
    return "Luar biasa! Kemampuan tempur kelas Ace. Langit aman di bawah sayapmu.";
  }
};