export interface AnimeTitle {
  romaji: string;
  english?: string | null;
  native?: string | null;
}

export interface AnimeSummary {
  id: number;
  idMal?: number | null;
  title: AnimeTitle;
  coverImage: {
    extraLarge: string;
    large: string;
    color?: string | null;
  };
  bannerImage?: string | null;
  description?: string | null;
  genres: string[];
  averageScore?: number | null;
  popularity?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  status?: string | null;
  isAdult?: boolean;
  studios?: string[];
  trailer?: {
    id: string;
    site: string;
    thumbnail?: string | null;
  } | null;
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  } | null;
  streamingEpisodesCount?: number;
}

export interface AnimeCharacter {
  id: number;
  name: string;
  image: string;
  role: string;
  voiceActor?: {
    id: number;
    name: string;
    image: string;
    language: string;
  } | null;
}

export interface AnimeEpisode {
  number: number;
  title: string;
  thumbnail?: string | null;
  duration: number;
  aired?: string | null;
  synopsis?: string | null;
  availableQualities?: string[];
  isFiller?: boolean;
  isRecap?: boolean;
}

export interface AnimeSeasonRelation {
  id: number;
  relationType: string;
  title: string;
  format?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
  coverImage: string;
  isCurrent?: boolean;
}

export interface AnimeDetail extends AnimeSummary {
  characters: AnimeCharacter[];
  seasons: AnimeSeasonRelation[];
  episodeList: AnimeEpisode[];
  recommendations: AnimeSummary[];
  mappings?: {
    anilist?: number;
    mal?: number;
    kitsu?: number;
  };
}

export interface RecentEpisodeDrop {
  anime: AnimeSummary;
  episodeNumber: number;
  episodeTitle: string;
  thumbnail: string;
  airedLabel: string;
  airingAt?: number | null;
  readyToWatch?: boolean;
  isNewDrop?: boolean;
}

export interface HomeFeed {
  hero: AnimeSummary[];
  trending: AnimeSummary[];
  seasonal: AnimeSummary[];
  popular: AnimeSummary[];
  topRated: AnimeSummary[];
  recentEpisodes: RecentEpisodeDrop[];
  newAnimes: AnimeSummary[];
  catalogRevision?: number;
  lastCatalogSyncAt?: string | null;
}

export interface CatalogUpdatesResponse {
  catalogRevision: number;
  lastCatalogSyncAt: string | null;
  hasUpdates: boolean;
  recentEpisodes?: RecentEpisodeDrop[];
  newAnimes?: AnimeSummary[];
}

export interface AppReleaseManifest {
  version: string;
  buildId: string;
  publishedAt: string;
  channel: 'official';
  catalogRevision?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  preferredAudio: 'SUB' | 'DUB';
  preferredQuality: '4K' | '1080p' | '720p';
  kidsMode: boolean;
  createdAt: string;
}

export interface WatchProgressItem {
  animeId: number;
  animeTitle: string;
  coverImage: string;
  bannerImage?: string | null;
  episodeNumber: number;
  episodeTitle: string;
  thumbnail: string;
  currentTime: number;
  duration: number;
  completed: boolean;
  genres: string[];
  updatedAt: string;
}

export interface WatchHistoryEntry {
  id: string;
  animeId: number;
  animeTitle: string;
  coverImage: string;
  episodeNumber: number;
  episodeTitle: string;
  thumbnail: string;
  watchedSeconds: number;
  durationSeconds: number;
  watchedAt: string;
}

export interface EpisodeProgressPoint {
  currentTime: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
}

export interface ProfileData {
  favorites: AnimeSummary[];
  progressByAnime: Record<string, WatchProgressItem>;
  episodeProgress: Record<string, EpisodeProgressPoint>;
  history: WatchHistoryEntry[];
}

export interface AccountWorkspace {
  syncCode: string;
  activeProfileId: string;
  profiles: UserProfile[];
  dataByProfile: Record<string, ProfileData>;
  updatedAt: string;
}

export interface AvatarCharacterOption {
  id: number;
  name: string;
  image: string;
}

export interface AvatarGroup {
  animeId: number;
  animeTitle: string;
  characters: AvatarCharacterOption[];
}

export interface BlitzSubtitleTrack {
  language: string;
  label: string;
  format?: 'vtt' | 'srt' | 'ass';
  url: string;
}

export interface BlitzVideoStream {
  sourceUrl: string;
  isHLS: boolean;
  quality: '1080p' | '720p' | '480p' | '360p' | 'auto';
  language?: 'sub' | 'dub' | 'raw';
  headers?: Record<string, string>;
  subtitles?: BlitzSubtitleTrack[];
}

export interface BlitzStreamResponse {
  authorized: boolean;
  status: 'OK' | 'LICENSE_REQUIRED' | 'UNAVAILABLE';
  message?: string;
  provider?: string;
  streams: BlitzVideoStream[];
}
