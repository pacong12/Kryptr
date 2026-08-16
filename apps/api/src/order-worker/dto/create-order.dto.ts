import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  CHAINS,
  ORDER_TYPES,
  type ChainId,
  type OrderType,
} from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

/**
 * Wire shape of POST /orders. Wave-4 scope: limit + dca only (stop/twap
 * are rejected by the use case with order_type_unsupported). null asset
 * = the chain's native asset.
 */
export class CreateOrderDto {
  @IsIn(ORDER_TYPES)
  type!: OrderType;

  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsIn(CHAINS)
  chain!: ChainId;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  baseAsset!: `0x${string}` | null;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  quoteAsset!: `0x${string}` | null;

  @IsIn(['buy', 'sell'])
  side!: 'buy' | 'sell';

  /** Raw units per execution; positive decimal integer string. */
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  amount!: string;

  /** USD-denominated trigger price (limit orders). */
  @IsOptional()
  @IsString()
  limitPrice!: string | null;

  /** ISO-8601 duration (dca orders), e.g. 'P1D'. */
  @IsOptional()
  @IsString()
  interval!: string | null;
}
