import * as migration_20261104_052518_initial from './20261104_052518_initial';

export const migrations = [
  {
    up: migration_20261104_052518_initial.up,
    down: migration_20261104_052518_initial.down,
    name: '20261104_052518_initial'
  },
];
