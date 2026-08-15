import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  CHAINS,
  type ChainId,
  type TransactionIntent,
} from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

const INTENT_KINDS = ['transfer', 'swap', 'deploy', 'approve'] as const;

/**
 * Wire shape of a TransactionIntent. Origin is still client-supplied in
 * Wave 1 (no auth yet); Wave 2 must stamp origin server-side from the
 * authenticated session before evaluation (threat model req. 2).
 */
export class EvaluateIntentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsIn(CHAINS)
  chain!: ChainId;

  @IsIn(INTENT_KINDS)
  kind!: TransactionIntent['kind'];

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  to!: `0x${string}` | null;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  asset!: `0x${string}` | null;

  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsDateString()
  createdAt!: string;
}
