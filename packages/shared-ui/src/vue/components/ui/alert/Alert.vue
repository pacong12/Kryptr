<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import type { AlertVariants } from '.';
import { reactiveOmit } from '@vueuse/core';
import { Primitive } from 'reka-ui';
import { cn } from '../../../lib/utils';
import { alertVariants } from '.';

const props = withDefaults(
  defineProps<
    PrimitiveProps & {
      variant?: AlertVariants['variant'];
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    as: 'div',
    variant: 'default',
  },
);

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <Primitive
    data-slot="alert"
    role="alert"
    aria-live="polite"
    :data-variant="variant"
    :class="cn(alertVariants({ variant }), props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </Primitive>
</template>
