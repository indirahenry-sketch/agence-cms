import * as migration_20261104_052518_initial from './20261104_052518_initial';
import * as migration_20261104_210659_prices_display from './20261104_210659_prices_display';
import * as migration_20261104_211500_ecuries_poigny from './20261104_211500_ecuries_poigny';
import * as migration_20261105_163439_media_s3_object_key from './20261105_163439_media_s3_object_key';
import * as migration_20261106_003543_cms_v2_menus_promos from './20261106_003543_cms_v2_menus_promos';
import * as migration_20261109_032840_cms_v3 from './20261109_032840_cms_v3';

export const migrations = [
  {
    up: migration_20261104_052518_initial.up,
    down: migration_20261104_052518_initial.down,
    name: '20261104_052518_initial',
  },
  {
    up: migration_20261104_210659_prices_display.up,
    down: migration_20261104_210659_prices_display.down,
    name: '20261104_210659_prices_display',
  },
  {
    up: migration_20261104_211500_ecuries_poigny.up,
    down: migration_20261104_211500_ecuries_poigny.down,
    name: '20261104_211500_ecuries_poigny',
  },
  {
    up: migration_20261105_163439_media_s3_object_key.up,
    down: migration_20261105_163439_media_s3_object_key.down,
    name: '20261105_163439_media_s3_object_key',
  },
  {
    up: migration_20261106_003543_cms_v2_menus_promos.up,
    down: migration_20261106_003543_cms_v2_menus_promos.down,
    name: '20261106_003543_cms_v2_menus_promos',
  },
  {
    up: migration_20261109_032840_cms_v3.up,
    down: migration_20261109_032840_cms_v3.down,
    name: '20261109_032840_cms_v3'
  },
];
