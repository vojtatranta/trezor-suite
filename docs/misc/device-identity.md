# Device identity and the selected device

Suite has no stable identity for a device. It keeps one global "selected device" and re-guesses which Connect device it is after every device event. This works with one device and one wallet open. It breaks down with Bluetooth, several connected devices, firmware updates and any UI that must answer a request from a specific device.

This note describes how identity works today, why the selected device carries so much, the case for and against it, and a direction that fixes the cause rather than each symptom.

All references are to `develop` at `7ee75382df`.

## How a device is identified today

Connect reports several identifiers, and none of them is stable for the life of a physical device:

| Identifier                            | Source                  | Changes when                                                                           |
| ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `features.device_id` (`device.id`)    | firmware                | wipe; absent in bootloader and before the device is acquired                           |
| `path`                                | Connect / transport     | reconnect, reboot (firmware update), another device on the same port; Bluetooth paths are sequential integers, not the BT UUID |
| `session_id` / `state.sessionId`      | firmware                | every session                                                                          |
| `state.staticSessionId`               | Connect, derived        | per wallet: `{first testnet address}@{device_id}:{instance}`, so it changes with the passphrase and on wipe |
| `instance`                            | Suite                   | assigned by Suite, one per wallet on the same hardware                                 |

Suite matches devices with a chain of fallbacks that picks a different identifier depending on what the device reports at that moment ([`suite-utils/src/device.ts`](../../suite-common/suite-utils/src/device.ts)):

- acquired: `device_id` plus `instance`;
- bootloader or no `device_id`: `path` plus `mode`;
- unacquired: `path`;
- after a wipe (`device_id` changed): `instance` plus `path`.

The same chain is re-implemented, with differences, in `getSelectedDevice`, `findInstanceIndex`, `isSelectedDevice`, the device reducer and the firmware slice.

Consequences already seen:

- **#28059**: a late `setDeviceState` matched a different device that was plugged into the same port, through the path fallback. The fix removes the path fallback there and matches by `device_id` only.
- **Firmware update**: the device goes from acquired to bootloader to acquired, possibly with a new identity. The firmware slice keeps a `cachedDevice` snapshot from before the reboot, because there is nothing reliable to find the device by afterwards.

## What "selected device" means

`state.device.selectedDevice` combines three roles:

1. **UI focus**: whose accounts the sidebar shows, which wallet the header names.
2. **The actor for device operations**: discovery, signing, staking, the desktop Connect popup bridge and most thunks start with `selectSelectedDevice(getState())`. There are 426 uses in 168 non-test files. `selectModalDevice`, the device that raised a Connect UI request, has no users.
3. **A copy of a device, not a pointer to one.** After every device-related action, `observeSelectedDeviceThunk` looks the copy up again in `devices` with the fallback chain above and replaces it if it changed. Sixteen places react to the selection changing, including `redirectMiddleware` and `eventsMiddleware`.

Changing the selection is therefore not "focus another device". It points the whole app at another device: discovery restarts, routes redirect, accounts swap.

## Where it shows

- **No auto-select of a newly connected device on desktop.** `selectNewlyConnectedDeviceThunk` refuses unless nothing is selected or it is the same hardware (`!isNative()`; mobile does auto-select). Selecting would also make the new device the actor for everything, which could interrupt a user mid-send.
- **Bluetooth.** A device can pair, connect and be ready in the background while another is selected, but there is no way to say "connected and ready" without making it the actor.
- **Passphrase and other Connect UI requests.** Connect sends `ui-request_passphrase` with the requesting device (`device.toMessageObject()`, including `id`, `path`, `features` and `state`). The modal reducer stores it as `modal.device`. Components still tend to read the selected device instead, for example the on-device passphrase modals in #34120. When the selected device is not the one asking, the modal shows the wrong hardware while the user is entering a secret.
- **Adding a hidden wallet.** Discovery state is keyed by device path and already records `isAddingHiddenWallet` and `status: 'enter-passphrase'`. The add-wallet UI reads it through the selected device's path rather than the requester's. The instance number of the wallet being created is computed in the discovery thunk and never stored, so nothing in Redux says which wallet is being added.

## The case for the selected device

- It is the app's unit of work. Every slice hangs off it, and the user model matches: one wallet is open at a time.
- Every flow that can raise a passphrase prompt today starts from the selected device: add-wallet from its card, discovery from `selectSelectedDevice`, the desktop popup bridge from the selected device's path.
- Suite's device entries carry what the UI needs (connection state, remembered flag, wallet number, labels). `modal.device` is Connect's snapshot from one moment and lacks those fields.
- Matching Connect devices to Suite devices has caused bugs (#28059). Reading a value Suite already maintains avoids writing new matching logic in components.
- It is one selector, one type and no mapping.

## The case against it

- A modal answers a specific request, and Connect states which device made it. Reading global state replaces that fact with an assumption.
- "Always the selected device" is a property of today's callers. Nothing enforces it, and Bluetooth, background discovery and a selection change while a modal is open each break it.
- "The new wallet is not in Redux" is true of the wallet, not of the hardware. Another instance with the same `id` is always there, and matching by `id` is what #28059 settled on.
- Components that read the global selection need the whole store arranged to test, and cannot be rendered for any other device.
- The selected device does not solve identity. It hides the same fallback chain behind one copy that is re-guessed on every event. With one device every guess resolves to the same thing. With two, or one rebooting into a new identity, the guess can land on the wrong one.

Both sides are right at different layers. The current approach protects a behaviour worth keeping: do not yank the user's context. The mechanism, one global slot for focus, actor and scope, makes it impossible to keep that behaviour and support several devices.

## Direction

1. **A Suite-owned device handle.** Minted when a device first appears and kept across acquire, release, bootloader, reboot and wipe. `path`, `device_id` and `session_id` become attributes of the handle, updated as they change, not keys.
2. **One resolver.** A single function answers "which handle is this Connect event about?" and owns the fallback rules now spread over `getSelectedDevice`, `findInstanceIndex`, `isSelectedDevice`, the device reducer and the firmware cache, with one test file. If Connect exposed a per-device handle that survived mode changes, the resolver would mostly pass it through.
3. **Operations take an explicit device.** Thunks take the handle or `staticSessionId` as a parameter, defaulting to the selected one. Connect-driven UI (passphrase, PIN, button requests) addresses the requester.
4. **"Selected" shrinks to UI focus.** It becomes a pointer (handle or `staticSessionId`), selectors derive the device from `devices`, and the reconcile thunk goes away. Auto-select becomes a focus decision only.

Smaller steps that need none of the above:

- Connect UI modals resolve the requester from Redux by hardware `id`: `selectDevices(state).find(d => d.id === modal.device.id)`. This gives the right model, colour and label even while the wallet being added does not exist yet.
- Store the instance being created in the discovery entry, so "this request is for the wallet being added" can be checked rather than assumed.
- Where code relies on "the requester is the selected device", assert it in development (`modal.device.id !== selectedDevice.id` warns), so the assumption is visible and fails loudly when a new flow breaks it.

## Open questions

- Can a device other than the selected one raise a passphrase or PIN request on desktop today? If not, the assertion above documents the invariant. If yes, the `id` lookup is needed now.
- Should the handle live in Suite or in Connect? Connect already has to follow a device through a firmware reboot.
- Which flows depend on "selection change restarts discovery" and would need an explicit trigger once selection is only focus?
