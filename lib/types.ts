/**
 * Steam API 相关的类型定义
 */

export interface SteamUserBasicInfo {
  steamid: string;
  communityvisibilitystate: number;
  profilestate: number;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarhash: string;
  personastate: number; // 0=离线, 1=在线, 2=忙碌, 3=离开, 4=打盹, 5=交易中, 6=游戏中
  realname?: string;
  timecreated?: number;
  loccountrycode?: string;
  gameextrainfo?: string;
  gameid?: string;
}

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  playtime_2weeks?: number;
  img_icon_url: string;
  img_logo_url: string;
  has_community_visible_stats?: boolean;
  playtime_last_played?: number;
  rtime_last_played?: number;
}

export interface SteamAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
  name?: string;
  description?: string;
}

export interface GameAchievementData {
  playerstats?: {
    steamID: string;
    gameName: string;
    achievements: SteamAchievement[];
    success: boolean;
  };
  game?: {
    gameName: string;
    gameVersion: string;
    achievementschema?: SteamAchievementSchema[];
    stats?: Array<{
      name: string;
      defaultvalue: number;
      displayName: string;
    }>;
  };
}

export interface SteamAchievementSchema {
  name: string;
  defaultvalue: number;
  displayName: string;
  hidden: number;
  description: string;
  icon: string;
  icongray: string;
  gameid?: string;
}

export interface GameDetailsResponse {
  [key: string]: {
    success: boolean;
    data?: {
      type: string;
      name: string;
      steam_appid: number;
      required_age: number;
      is_free: boolean;
      controller_support?: string;
      dlc?: number[];
      fullgame?: {
        appid: number;
        name: string;
      };
      packages?: number[];
      package_groups?: Array<{
        name: string;
        title: string;
        description: string;
        selection_text: string;
        save_text: string;
        display_type: number;
        is_recurring_subscription: string;
        subs: Array<{
          packageid: number;
          percent_savings_text: string;
          percent_savings: number;
          option_text: string;
          option_description: string;
          can_get_free_license: string;
          is_free_license: boolean;
          price_in_cents_with_discount: number;
        }>;
      }> | null;
      platforms: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
      };
      metacritic?: {
        score: number;
        url: string;
      };
      categories?: Array<{
        id: number;
        description: string;
      }>;
      genres?: Array<{
        id: string;
        description: string;
      }>;
      screenshots?: Array<{
        id: number;
        path_thumbnail: string;
        path_full: string;
      }>;
      movies?: Array<{
        id: number;
        name: string;
        thumbnail: string;
        webm: {
          480: string;
          max: string;
        };
        mp4: {
          480: string;
          max: string;
        };
        highlight: boolean;
      }>;
      recommendations?: {
        total: number;
      };
      achievements?: {
        total: number;
        highlighted?: Array<{
          name: string;
          path: string;
        }>;
      };
      release_date?: {
        coming_soon: boolean;
        date: string;
      };
      support_info?: {
        url: string;
        email: string;
      };
      background?: string;
      background_raw?: string;
      website?: string;
      pc_requirements?: {
        minimum?: string;
        recommended?: string;
      };
      mac_requirements?: {
        minimum?: string;
        recommended?: string;
      };
      linux_requirements?: {
        minimum?: string;
        recommended?: string;
      };
      legal_notice?: string;
      developers?: string[];
      publishers?: string[];
      price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
        initial_formatted: string;
        final_formatted: string;
      };
      short_description?: string;
      detailed_description?: string;
    };
  };
}

/**
 * API 响应类型
 */

export interface UserAvatar {
  small: string;
  medium: string;
  large: string;
}

export interface CurrentGame {
  appid: number;
  name: string;
}

export interface GameImages {
  icon: string;
  logo: string;
  headerImage: string;
  heroImage: string;
  libraryHeroImage: string;
}

export interface GamePrice {
  amount: number;
  currency: string;
  displayPrice: string;
}

export interface RecentGame {
  appid: number;
  name: string;
  playtimeForever: number;
  playtimeTwoWeeks: number;
  price: GamePrice;
  images: GameImages;
  releaseDate: string;
  shortDescription: string;
}

export interface AllGame {
  appid: number;
  name: string;
  playtimeForever: number;
  playtimeTwoWeeks: number;
  images: {
    icon: string;
    headerImage: string;
  };
}

export interface GamesData {
  totalCount: number;
  recentGames: RecentGame[];
  allGames: AllGame[];
}

export interface Achievement {
  name: string;
  description: string;
  unlocked: boolean;
  unlockTime: number;
  images: {
    icon: string;
    iconGray: string;
  };
}

export interface GameAchievements {
  appid: number;
  gameName: string;
  total: number;
  unlocked: number;
  percentage: number;
  items: Achievement[];
}

export interface AchievementsData {
  totalCount: number;
  unlockedCount: number;
  unlockedPercentage: number;
  byGame: GameAchievements[];
}

export interface UserInfo {
  steamid: string;
  username: string;
  profileUrl: string;
  avatar: UserAvatar;
  status: 'online' | 'offline' | 'away' | 'snooze' | 'busy' | 'trading' | 'playing';
  statusMessage: string;
  currentGame?: CurrentGame;
  playtimeStats: {
    totalForever: number; // 总游玩时长（小时）
    totalTwoWeeks: number; // 最近两周总游玩时长（小时）
  };
}

export interface ResponseData {
  user: UserInfo;
  games: GamesData;
  achievements: AchievementsData;
}

export interface Metadata {
  cached: boolean;
  cachedAt: string;
  cacheExpiry: string;
  fetchDuration: string;
}

export interface SuccessResponse {
  success: true;
  data: ResponseData;
  metadata: Metadata;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

export type ApiResponse = SuccessResponse | ErrorResponse;

/**
 * 缓存类型
 */

export interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number; // 毫秒
}

export interface CacheStore {
  [key: string]: CacheItem<any>;
}
