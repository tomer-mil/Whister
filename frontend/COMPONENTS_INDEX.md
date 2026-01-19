# Component Library Index

Quick reference for all UI and shared components.

## UI Components (`components/ui/`)

### Button
```tsx
import { Button } from '@/components/ui';

// Variants
<Button variant="primary" />
<Button variant="secondary" />
<Button variant="outline" />
<Button variant="destructive" />
<Button variant="ghost" />
<Button variant="success" />

// Sizes
<Button size="sm" />
<Button size="md" />
<Button size="lg" />
<Button size="xl" />
<Button size="icon" />
<Button size="icon-sm" />
<Button size="icon-lg" />

// States
<Button disabled />
<Button loading>Loading</Button>
<Button fullWidth>Full Width</Button>
```

### Card
```tsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui';

<Card variant="default" padding="md">
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>

// Variants: default, elevated, outlined, interactive
// Padding: none, sm, md, lg
```

### Input
```tsx
import { Input } from '@/components/ui';

<Input 
  label="Email"
  type="email"
  placeholder="Enter email"
  error="Invalid email"
  helperText="We'll never share your email"
/>
```

### Dialog
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui';

<Dialog.Root open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <DialogBody>Content</DialogBody>
    <DialogFooter>Actions</DialogFooter>
  </DialogContent>
</Dialog.Root>
```

### Select
```tsx
import { 
  SelectContainer, 
  SelectTrigger, 
  SelectContent, 
  SelectItem,
  SelectValue 
} from '@/components/ui';

<SelectContainer label="Choose option" error="Required">
  <SelectPrimitive.Root>
    <SelectTrigger>
      <SelectValue placeholder="Select..." />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="1">Option 1</SelectItem>
      <SelectItem value="2">Option 2</SelectItem>
    </SelectContent>
  </SelectPrimitive.Root>
</SelectContainer>
```

### Toast
```tsx
import { Toast, ToastViewport, ToastTitle, ToastDescription } from '@/components/ui';

<ToastViewport />
<Toast type="success" open={open} onOpenChange={setOpen}>
  <ToastTitle>Success!</ToastTitle>
  <ToastDescription>Operation completed</ToastDescription>
</Toast>

// Types: success, error, warning, info
```

## Shared Components (`components/shared/`)

### LoadingSpinner
```tsx
import { LoadingSpinner } from '@/components/shared';

<LoadingSpinner size="md" />
<LoadingSpinner size="sm" className="text-indigo-600" />
<LoadingSpinner size="lg" />

// Sizes: sm (4x4), md (8x8), lg (12x12)
```

### Avatar
```tsx
import { Avatar } from '@/components/shared';

<Avatar alt="User Name" initials="JD" size="md" />
<Avatar alt="User" src="https://..." size="lg" />
<Avatar alt="John" initials="J" size="sm" />

// Sizes: sm, md, lg, xl
```

### ConnectionStatus
```tsx
import { ConnectionStatus } from '@/components/shared';

<ConnectionStatus />

// Shows status from Zustand store
// Status types: connected, connecting, disconnected, reconnecting
```

## Animation Variants (`config/animations.ts`)

```tsx
import { fadeIn, slideUp, popIn, playerCardVariants } from '@/config/animations';
import { motion } from 'framer-motion';

// Use with Framer Motion
<motion.div variants={fadeIn} initial="initial" animate="animate">
  Content
</motion.div>

// Available variants:
// - fadeIn, slideUp, slideIn, scale, popIn
// - playerCardVariants, bidPlacedVariants, scoreChangeVariants
// - positiveScoreVariants, negativeScoreVariants
// - toastVariants, connectionPulseVariants, dialogContentVariants
// - containerVariants, itemVariants
```

## Barrel Exports

### UI Components Export
```tsx
// Single import for all UI components
import { 
  Button, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardFooter,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  SelectContainer,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
  Toast,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  // ...and more
} from '@/components/ui';
```

### Shared Components Export
```tsx
import { LoadingSpinner, Avatar, ConnectionStatus } from '@/components/shared';
```

### Animation Export
```tsx
import { fadeIn, slideUp, transitions, playerCardVariants } from '@/config/animations';
```

## Props Reference

### Button Props
- `variant?`: primary | secondary | outline | destructive | ghost | success
- `size?`: sm | md | lg | xl | icon | icon-sm | icon-lg
- `fullWidth?`: boolean
- `loading?`: boolean
- `disabled?`: boolean
- `asChild?`: boolean (Radix Slot composition)

### Card Props
- `variant?`: default | elevated | outlined | interactive
- `padding?`: none | sm | md | lg

### Input Props
- `label?`: string
- `error?`: string
- `helperText?`: string
- `disabled?`: boolean
- `type?`: string
- Standard HTML input attributes

### Avatar Props
- `size?`: sm | md | lg | xl
- `src?`: string (image URL)
- `alt`: string (required)
- `initials?`: string (fallback text)
- `fallback?`: React.ReactNode (custom fallback)

### LoadingSpinner Props
- `size?`: sm | md | lg
- `className?`: string (for color override)

### Dialog Props
- `open`: boolean
- `onOpenChange`: (open: boolean) => void

### Toast Props
- `type`: success | error | warning | info
- `open`: boolean
- `onOpenChange`: (open: boolean) => void

## Usage Patterns

### Form with Input
```tsx
import { useForm } from 'react-hook-form';
import { Input, Button } from '@/components/ui';

export function LoginForm() {
  const { register, formState: { errors } } = useForm();
  
  return (
    <form>
      <Input 
        label="Email"
        {...register('email')}
        error={errors.email?.message}
      />
      <Button type="submit">Submit</Button>
    </form>
  );
}
```

### Modal Dialog
```tsx
import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui';

export function Modal() {
  const [open, setOpen] = useState(false);
  
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog.Root>
    </>
  );
}
```

### Animated Component
```tsx
import { motion } from 'framer-motion';
import { fadeIn, transitions } from '@/config/animations';
import { Card } from '@/components/ui';

export function AnimatedCard() {
  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      transition={transitions.normal}
    >
      <Card>Content</Card>
    </motion.div>
  );
}
```

## Accessibility

All components include:
- Keyboard navigation support
- ARIA labels and roles (via Radix UI)
- Focus management
- Screen reader support
- Color contrast compliance

## Responsive Design

All components support:
- Mobile-first approach
- Breakpoints: xs, sm, md, lg, xl, 2xl
- Tailwind responsive classes
- Safe area support for PWA

## Performance

- Memoized components where beneficial
- Framer Motion optimizations (transform + opacity)
- No unnecessary re-renders
- Lazy animation initialization

---

For detailed component specifications, see `COMPONENTS_SUMMARY.md`
