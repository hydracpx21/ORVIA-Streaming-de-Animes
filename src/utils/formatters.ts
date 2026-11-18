import type { AnimeSummary } from '../types/anime';

export const GENRE_MAP: Record<string, string> = {
  Action: 'Ação',
  Adventure: 'Aventura',
  Comedy: 'Comédia',
  Drama: 'Drama',
  Ecchi: 'Ecchi',
  Fantasy: 'Fantasia',
  Horror: 'Terror',
  'Mahou Shoujo': 'Garota Mágica',
  Mecha: 'Mecha',
  Music: 'Música',
  Mystery: 'Mistério',
  Psychological: 'Psicológico',
  Romance: 'Romance',
  'Sci-Fi': 'Ficção Científica',
  'Slice of Life': 'Cotidiano',
  Sports: 'Esportes',
  Supernatural: 'Sobrenatural',
  Thriller: 'Suspense',
};

export const GENRE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'Action', label: 'Ação' },
  { id: 'Adventure', label: 'Aventura' },
  { id: 'Fantasy', label: 'Fantasia' },
  { id: 'Drama', label: 'Drama' },
  { id: 'Thriller', label: 'Suspense' },
  { id: 'Sci-Fi', label: 'Ficção Científica' },
  { id: 'Supernatural', label: 'Sobrenatural' },
  { id: 'Comedy', label: 'Comédia' },
  { id: 'Romance', label: 'Romance' },
  { id: 'Mystery', label: 'Mistério' },
  { id: 'Sports', label: 'Esportes' },
  { id: 'Horror', label: 'Terror' },
  { id: 'Psychological', label: 'Psicológico' },
  { id: 'Mecha', label: 'Mecha' },
  { id: 'Slice of Life', label: 'Cotidiano' },
];

export const FORMAT_MAP: Record<string, string> = {
  TV: 'Série TV',
  TV_SHORT: 'Curta TV',
  MOVIE: 'Filme',
  SPECIAL: 'Especial',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Clipe Musical',
};

export const STATUS_MAP: Record<string, string> = {
  FINISHED: 'Finalizado',
  RELEASING: 'Em lançamento',
  NOT_YET_RELEASED: 'Em breve',
  CANCELLED: 'Cancelado',
  HIATUS: 'Em hiato',
};

export const SEASON_MAP: Record<string, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
};

const CURATED_PT_SYNOPSIS: Record<number, string> = {
  151807:
    'Em um mundo onde caçadores humanos despertaram habilidades mágicas para enfrentar monstros letais vindos de portais dimensionais, Sung Jinwoo é conhecido como o caçador mais fraco de todos. Após sobreviver por pouco a uma masmorra dupla mortal, ele recebe um misterioso Sistema que lhe concede o poder único de subir de nível sem limites.',
  154587:
    'Após uma jornada de dez anos ao lado do grupo de heróis que derrotou o Rei Demônio, a maga elfa imortal Frieren vê o tempo passar de forma implacável para seus antigos companheiros humanos. Décadas depois, ela parte em uma nova viagem para compreender o valor das memórias, dos vínculos e da efemeridade da vida.',
  16498:
    'Há mais de um século, a humanidade foi obrigada a se refugiar atrás de muralhas colossais para escapar de gigantes devoradores conhecidos como Titãs. Quando a muralha externa cai diante de um Titã Colossal, o jovem Eren Yeager jura exterminar cada um deles e descobrir a verdade oculta por trás das paredes.',
  113415:
    'Yuji Itadori leva uma vida aparentemente comum até engolir um dedo amaldiçoado pertencente a Ryomen Sukuna, o Rei das Maldições. Para proteger seus amigos e controlar a entidade que habita seu corpo, ele ingressa na Escola Técnica de Jujutsu de Tóquio e mergulha em um submundo de feitiçaria e combates implacáveis.',
  101922:
    'No Japão da era Taisho, Tanjiro Kamado retorna para casa e encontra sua família massacrada por um oni, com sua irmã Nezuko transformada em demônio. Determinado a encontrar uma cura e vingar seus entes queridos, Tanjiro inicia um treinamento rigoroso para se tornar um Caçador de Onis.',
  21:
    'Inspirado pelo lendário pirata Shanks, Monkey D. Luffy parte em uma aventura pelos mares perigosos da Grand Line ao lado de sua tripulação dos Chapéus de Palha em busca do maior tesouro do mundo: o One Piece.',
  127230:
    'Endividado e traído pela yakuza, Denji sobrevive caçando demônios com seu cão-serra Pochita. Após um ataque fatal, os dois se fundem em um pacto de sobrevivência, transformando Denji no implacável Homem-Motosserra a serviço da Divisão Especial de Segurança Pública.',
  171018:
    'Momo Ayase acredita em fantasmas, mas não em alienígenas; seu colega Okarun acredita em alienígenas, mas não em fantasmas. Quando ambos decidem provar quem está certo explorando locais assombrados e ruínas misteriosas, acabam envolvidos em uma batalha caótica contra forças ocultas e extraterrestres.',
  101348:
    'Criado ouvindo relatos sobre a terra lendária de Vinland, o jovem islandês Thorfinn vê sua infância despedaçada quando seu pai é assassinado por mercenários. Consumido pelo desejo de vingança, ele cresce nos campos de batalha da Europa medieval até questionar o verdadeiro significado de um guerreiro.',
  1535:
    'Light Yagami, um estudante brilhante entediado com a criminalidade do mundo, encontra um caderno sobrenatural capaz de matar qualquer pessoa cujo nome seja escrito em suas páginas. Enquanto busca criar uma utopia sob a identidade de Kira, o enigmático detetive L inicia uma caçada intelectual sem precedentes.',
  140960:
    'Para evitar uma guerra iminente entre duas nações rivais, o agente secreto Twilight precisa montar uma família falsa em tempo recorde. Sem que ele desconfie, sua esposa Yor é uma assassina de elite e sua filha adotiva Anya é uma telepata capaz de ler os segredos de todos.',
  11061:
    'Determinado a encontrar o pai desaparecido, o jovem Gon Freecss parte para o exigente Exame Hunter. Ao lado de Killua, Kurapika e Leorio, ele descobre um universo vasto de criaturas raras, técnicas de aura e perigos mortais.',
};

export function translateGenre(genre: string): string {
  return GENRE_MAP[genre] || genre;
}

export function translateFormat(format?: string | null): string {
  if (!format) return 'Série TV';
  return FORMAT_MAP[format] || format;
}

export function translateStatus(status?: string | null): string {
  if (!status) return 'Disponível';
  return STATUS_MAP[status] || status;
}

export function translateSeason(season?: string | null): string {
  if (!season) return '';
  return SEASON_MAP[season] || season;
}

export function getDisplayTitle(anime: Pick<AnimeSummary, 'title'>): string {
  return anime.title.english || anime.title.romaji || anime.title.native || 'Sem título';
}

export function getOriginalTitle(anime: Pick<AnimeSummary, 'title'>): string {
  if (anime.title.native && anime.title.romaji && anime.title.native !== anime.title.romaji) {
    return `${anime.title.romaji} · ${anime.title.native}`;
  }
  return anime.title.romaji || anime.title.native || '';
}

export function formatScore(score?: number | null): string {
  if (!score) return 'N/D';
  return (score / 10).toFixed(1);
}

export function getAgeRating(anime: Pick<AnimeSummary, 'isAdult' | 'genres'>): string {
  if (anime.isAdult) return '18+';
  const g = new Set(anime.genres || []);
  if (g.has('Horror') || g.has('Psychological') || g.has('Thriller')) return '16+';
  if (g.has('Action') || g.has('Supernatural') || g.has('Drama')) return '14+';
  return '12+';
}

export function cleanDescription(animeId: number, raw?: string | null): string {
  if (CURATED_PT_SYNOPSIS[animeId]) {
    return CURATED_PT_SYNOPSIS[animeId];
  }
  if (!raw) {
    return 'Sinopse oficial indisponível no momento. Clique em Assistir agora para explorar os episódios disponíveis.';
  }
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatTimeSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getBestBackdrop(anime: Pick<AnimeSummary, 'bannerImage' | 'trailer' | 'coverImage'>): string | null {
  if (anime.bannerImage) return anime.bannerImage;
  if (anime.trailer?.site === 'youtube' && anime.trailer.id) {
    return `https://i.ytimg.com/vi/${anime.trailer.id}/maxresdefault.jpg`;
  }
  return null;
}

export const DEFAULT_CHARACTER_AVATAR =
  'https://s4.anilist.co/file/anilistcdn/character/large/b40-MNypXsxSRb1R.png';

export function resolveProfileAvatar(avatar?: string | null): string {
  if (!avatar || avatar.startsWith('/src/assets/images/avatar_')) {
    return DEFAULT_CHARACTER_AVATAR;
  }
  return avatar;
}
