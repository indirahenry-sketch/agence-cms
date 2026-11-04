import * as migration_20261104_052518_initial from './20261104_052518_initial';
import * as migration_20261104_210659_prices_display from './20261104_210659_prices_display';
import * as migration_20261104_211500_ecuries_poigny from './20261104_211500_ecuries_poigny';

export const migrations = [
  {
    up: migration_20261104_052518_initial.up,
    down: migration_20261104_052518_initial.down,
    name: '20261104_052518_initial',
  },
  {
    up: migration_20261104_210659_prices_display.up,
    down: migration_20261104_210659_prices_display.down,
    name: '20261104_210659_prices_display'
  },
  {
    up: migration_20261104_211500_ecuries_poigny.up,
    down: migration_20261104_211500_ecuries_poigny.down,
    name: '20261104_211500_ecuries_poigny'
  },
];
