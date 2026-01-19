'use client';

import { useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@/components/ui';
import {
  LoadingSpinner,
  Avatar,
  ConnectionStatus,
} from '@/components/shared';

export default function TestPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          UI Components Test Page
        </h1>

        {/* Buttons */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Buttons
          </h2>
          <Card variant="default" padding="lg">
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="success">Success</Button>
                <Button variant="destructive">Destructive</Button>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-700 mb-3">Sizes</h3>
                <div className="flex flex-wrap gap-4">
                  <Button size="sm">Small</Button>
                  <Button size="md">Medium</Button>
                  <Button size="lg">Large</Button>
                  <Button size="xl">Extra Large</Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-700 mb-3">States</h3>
                <div className="flex flex-wrap gap-4">
                  <Button disabled>Disabled</Button>
                  <Button
                    loading={loading}
                    onClick={() => {
                      setLoading(true);
                      setTimeout(() => setLoading(false), 2000);
                    }}
                  >
                    {loading ? 'Loading...' : 'Click me'}
                  </Button>
                  <Button fullWidth>Full Width</Button>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-700 mb-3">Icon Buttons</h3>
                <div className="flex flex-wrap gap-4">
                  <Button size="icon-sm">+</Button>
                  <Button size="icon">+</Button>
                  <Button size="icon-lg">+</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Cards */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card variant="default">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  This is a default card with standard styling.
                </p>
              </CardContent>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  This card has an elevated shadow effect.
                </p>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardHeader>
                <CardTitle>Outlined Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  This card has a border outline with no shadow.
                </p>
              </CardContent>
            </Card>

            <Card variant="interactive">
              <CardHeader>
                <CardTitle>Interactive Card</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  Hover over this card for an interactive effect.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Input */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Inputs</h2>
          <Card variant="default" padding="lg">
            <CardContent className="space-y-6">
              <Input label="Basic Input" placeholder="Enter text..." />
              <Input
                label="Input with Helper"
                placeholder="Type something"
                helperText="This is a helper message"
              />
              <Input
                label="Input with Error"
                placeholder="Invalid input"
                error="This field is required"
              />
              <Input
                label="Disabled Input"
                placeholder="Disabled"
                disabled
              />
            </CardContent>
          </Card>
        </section>

        {/* Dialog */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Dialog</h2>
          <Card variant="default" padding="lg">
            <CardContent>
              <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
                <Button onClick={() => setDialogOpen(true)}>
                  Open Dialog
                </Button>

                <DialogContent>
                  <DialogClose />
                  <DialogHeader>
                    <DialogTitle>Dialog Title</DialogTitle>
                  </DialogHeader>
                  <DialogBody>
                    <p className="text-sm text-gray-600">
                      This is a sample dialog with Framer Motion animations.
                      Click outside or the X button to close.
                    </p>
                  </DialogBody>
                  <DialogFooter>
                    <Button
                      variant="secondary"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => setDialogOpen(false)}>
                      Confirm
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog.Root>
            </CardContent>
          </Card>
        </section>

        {/* Shared Components */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Shared Components
          </h2>
          <Card variant="default" padding="lg">
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-3">
                  Loading Spinner
                </h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <LoadingSpinner size="sm" />
                    Small
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <LoadingSpinner size="md" />
                    Medium
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <LoadingSpinner size="lg" />
                    Large
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-700 mb-3">Avatars</h3>
                <div className="flex gap-4">
                  <Avatar alt="User 1" initials="AB" size="sm" />
                  <Avatar alt="User 2" initials="CD" size="md" />
                  <Avatar alt="User 3" initials="EF" size="lg" />
                  <Avatar alt="User 4" initials="GH" size="xl" />
                </div>
              </div>

              <div className="pt-4 border-t">
                <h3 className="font-medium text-gray-700 mb-3">
                  Connection Status
                </h3>
                <div className="space-y-2 text-sm">
                  <ConnectionStatus />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Info */}
        <section className="mb-12">
          <Card variant="outlined" padding="lg">
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-2">
                Test Page Ready for Deletion
              </h3>
              <p className="text-sm text-gray-600">
                This test page demonstrates all the base UI components. After
                verifying the components render correctly, this file should be
                deleted.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
