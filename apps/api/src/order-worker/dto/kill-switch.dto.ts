import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  KILL_SWITCH_MODES,
  type KillSwitchMode,
} from '@kryptr/shared-types';

/**
 * Wire shape of POST /automation/kill-switch. DeckUI backoffice sends
 * exactly `{ mode, reason }` (their client times out at 2.5s — the
 * controller acks fast and fans out cancel_active asynchronously);
 * `actor` defaults server-side until auth lands.
 */
export class KillSwitchDto {
  @IsIn(KILL_SWITCH_MODES)
  mode!: KillSwitchMode;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  actor?: string;
}
