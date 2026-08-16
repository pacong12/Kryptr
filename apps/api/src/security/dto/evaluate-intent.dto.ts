import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CHAINS,
  VERIFICATION_CLAIMS,
  type ChainId,
  type DeployContext,
  type SwapContext,
  type TransactionIntent,
  type VerificationClaimKind,
} from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

const INTENT_KINDS = ['transfer', 'swap', 'deploy', 'approve'] as const;

/**
 * Wire shape of SwapContext — required on kind='swap' intents, binds the
 * intent to exactly one quote (single-use).
 */
export class SwapContextDto implements SwapContext {
  @IsString()
  @IsNotEmpty()
  quoteId!: string;

  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @Matches(ADDRESS_PATTERN)
  buyAsset!: `0x${string}` | null;

  @IsString()
  @IsNotEmpty()
  minBuyAmount!: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  maxSlippageBps!: number;

  @IsDateString()
  quoteExpiresAt!: string;
}

/**
 * Wire shape of the wave-5 DeployContext (frozen contract, gate #4).
 * Transport-level SHAPE checks only — charset/length/positivity/fee
 * semantics are the gate's job (deploy-preconditions), so consent-form
 * failures surface as stable gate reject codes (deploy_context_invalid,
 * fee_schedule_invalid, …), never as opaque 400s (FaceUI parity).
 */
export class VerificationClaimDto {
  @IsIn(VERIFICATION_CLAIMS)
  claim!: VerificationClaimKind;

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsDateString()
  verifiedAt!: string;
}

export class VerificationArtifactRefDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  hash!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested()
  @Type(() => VerificationClaimDto)
  claims!: VerificationClaimDto[];
}

export class FeeRecipientsDto {
  @IsString()
  @Matches(ADDRESS_PATTERN)
  creator!: `0x${string}`;

  @IsString()
  @Matches(ADDRESS_PATTERN)
  lp!: `0x${string}`;

  @IsString()
  @Matches(ADDRESS_PATTERN)
  protocol!: `0x${string}`;

  @IsString()
  @Matches(ADDRESS_PATTERN)
  buyback!: `0x${string}`;
}

export class FeeBpsDto {
  @IsInt()
  @Min(0)
  @Max(10_000)
  creator!: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  lp!: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  protocol!: number;

  @IsInt()
  @Min(0)
  @Max(10_000)
  buyback!: number;
}

export class TokenFeeScheduleDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  creatorShare!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  lpShare!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  protocolShare!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  buybackShare!: number;
}

export class DeployContextDto implements DeployContext {
  @IsString()
  tokenName!: string;

  @IsString()
  tokenSymbol!: string;

  @IsString()
  @IsNotEmpty()
  totalSupply!: string;

  @IsString()
  @Matches(ADDRESS_PATTERN)
  factory!: `0x${string}`;

  @ValidateNested()
  @Type(() => TokenFeeScheduleDto)
  feeSchedule!: TokenFeeScheduleDto;

  @ValidateNested()
  @Type(() => FeeBpsDto)
  feeBps!: FeeBpsDto;

  @ValidateNested()
  @Type(() => FeeRecipientsDto)
  feeRecipients!: FeeRecipientsDto;

  @IsBoolean()
  bondPaid!: boolean;

  @ValidateIf((_dto, value) => value !== undefined)
  @ValidateNested()
  @Type(() => VerificationArtifactRefDto)
  verification?: VerificationArtifactRefDto;
}

/**
 * Wire shape of a TransactionIntent. Origin is still client-supplied in
 * Wave 2 (no auth yet); server-side origin stamping from the
 * authenticated session is the logged wave-3 item (threat model req. 2).
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

  @ValidateIf((dto) => dto.kind === 'swap')
  @ValidateNested()
  @Type(() => SwapContextDto)
  swap?: SwapContextDto;

  /** Required iff kind === 'deploy'; a missing context reaches the gate
   *  and fails closed there (deploy_context_invalid). */
  @ValidateIf((dto) => dto.kind === 'deploy')
  @ValidateNested()
  @Type(() => DeployContextDto)
  deploy?: DeployContextDto;

  @IsDateString()
  createdAt!: string;
}
