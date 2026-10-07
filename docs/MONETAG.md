# Monetag Integration Status

**Last Updated**: 2026-10-06  
**Status**: ⚠️ Rewarded ads unavailable for standard websites (verified)  
**Research**: See official docs below

## Summary

Monetag's documented server-side verification system for rewarded ads is currently **only supported for Telegram Mini Apps** (TMA). Standard browser websites do not have an officially documented rewarded-ad flow.

### What This Means

✅ **Available Now**:
- Game plays without ads
- Admin panel allows safe Monetag script configuration (no code injection)
- Non-rewarded ad formats can be shown (banners, popunders, etc.) if configured
- Revive mechanic is fully implemented and tested (works with mock ads in dev)

❌ **Currently Unavailable**:
- Rewarded revival on standard websites
- Server-side verification of ad completion
- Official Monetag webhook for payment confirmation

## Research Documentation

### Official Monetag Links Consulted

1. **SDK Reference**: https://docs.monetag.com/docs/sdk-reference/
   - Documents `show_XXX()` methods for Telegram Mini Apps
   - Supports Rewarded Interstitial, Rewarded Popup, In-App Interstitial

2. **Postback System**: https://docs.monetag.com/docs/postbacks/
   - Server-to-server event notifications (only for TMA formats)
   - Documentation limited to Telegram Mini App scenarios

3. **Types of Postbacks**: https://docs.monetag.com/docs/postbacks/types/
   - Impressions and Clicks only (no conversion/completion webhook documented for websites)

4. **Postback Configuration**: https://docs.monetag.com/docs/postbacks/configuration/
   - Example uses Telegram-specific fields (`qs`, `click`, etc.)

5. **FAQ**: https://docs.monetag.com/docs/ad-integration/faq/
   - Mentions Telegram Mini App frequently
   - No alternative integration method documented

6. **GitHub SDK**: https://github.com/propellerads/monetag-tg-sdk
   - Repository is `monetag-tg-sdk` (TMA specific)
   - No separate SDK for ordinary websites mentioned

## Implementation Status

### Rewarded Revival (Current)

**State Machine (Server-Side)**:
```typescript
claim.status: 'waiting' → 'ad_shown' → ('verified' | 'expired')
```

**Behavior**:
- When player dies, a revive claim is created
- Claim expires after 5 minutes (configurable: `REVIVAL_CLAIM_EXPIRY`)
- Claims are validated for: duplicate, expired, cross-session attacks
- Duplicate/expired claims are rejected

**Client UI**:
- Shows "Revive (Unavailable)" with explanation in production
- Shows full revive UI with "Watch Ad" in mock mode (dev)
- No client-side workarounds; transparent about limitations

### Configuration Interface

**Admin Panel** (`/admin/advertising`):
- Paste Monetag script URL safely (parsed, not executed)
- Configure zone IDs and frequency caps
- Enable/disable advertising globally
- **No code injection**: Scripts only loaded on game page, never in admin panel

**Environment Variables**:
```bash
AD_ENABLE=false                           # Master switch
AD_MONETAG_SCRIPT_URL=                    # Script URL from admin
AD_REWARD_ZONE_ID=                        # Zone ID for rewarded ads
AD_FREQUENCY_CAP_DAILY=3                  # Max ads per day per player
```

## Path Forward

### Option 1: Telegram Mini App (Future)

If you decide to create a Telegram Mini App version:

1. Integrate `monetag-tg-sdk`:
   ```bash
   npm install monetag-tg-sdk
   ```

2. Use postback verification:
   ```typescript
   // Listen for Monetag postback webhook
   app.post('/api/monetag-postback', (req, res) => {
     // Verify ymid matches your session/death
     // Update revive_claims.status = 'verified'
   });
   ```

3. Reuse existing state machine (already compatible)

4. Deploy Telegram version alongside web version (same backend, different clients)

### Option 2: Alternative Ad Provider (Future)

Research other providers with web support:
- **Google AdSense**: Limited rewarded ad support
- **AdMob**: For apps/games, limited web
- **Adxr**: Indie game monetization
- **Azerion**: HTML5 games, has rewarded ads

Each would require implementing a new provider adapter in `packages/server/src/ads/`.

### Option 3: Other Monetization (Now)

- **Sponsored content**: Show ads before revive, but don't tie revives to completion
- **Battle pass**: Premium cosmetics, battle pass
- **Cosmetics**: Snake skins, colors, effects
- **Season pass**: Monthly premium features

Revive system would work with any of these (not dependent on ads).

## Technical Details

### Adapter Pattern

The code uses a provider adapter pattern for flexibility:

```typescript
// packages/server/src/ads/provider.ts
interface AdProvider {
  capabilities: {
    rewarded: boolean;
    interstitial: boolean;
    // etc
  };
  initialize(config: AdConfig): Promise<void>;
  showRewarded(zoneId: string): Promise<RewardResult>;
}

// Currently:
class MockProvider implements AdProvider {
  // In dev: always resolves after 3s
}

class MonetizationAdapter implements AdProvider {
  // In prod: Monetag placeholder (no-op)
  // When available: integrate real postback verification
}
```

### Database Schema

Existing tables support future integration:
- `ad_events`: Tracks requests, impressions, clicks, successes
- `revive_claims`: Tracks claim lifecycle (created, verified, used, expired)
- `audit_logs`: Records all configuration changes

No schema migration needed when Monetag support is added.

## Testing

### Dev Mode

```bash
NODE_ENV=development npm run dev
```

- `AD_ENABLE=true`
- Mock provider always resolves ad completion
- Revive UI shows "Watch Ad" button
- Full flow works end-to-end

### Production Mode

```bash
NODE_ENV=production
AD_ENABLE=false  # Disabled by default
```

- Revive UI shows "Unavailable" with explanation
- Admin can paste Monetag script (won't do anything yet)
- Core game fully playable without ads

## Migration Path

When Monetag or another provider adds web support:

1. **Verify documentation** from official source
2. **Create provider adapter**:
   ```bash
   packages/server/src/ads/monetag-web.ts
   ```
3. **Implement verification**:
   - SDK initialization
   - Reward callback / postback webhook
   - Claim validation logic
4. **Test end-to-end**:
   - Player dies → claim created
   - Watch ad → verification received
   - Revive successful
   - Retry with expired claim → rejected
5. **Update admin UI** to show "Verified" status
6. **Deploy with feature flag** or new `AD_PROVIDER` env var

## Questions?

- **For Monetag integration**: Contact Monetag support for web support or Telegram pricing
- **For code questions**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **For deployment**: See [SETUP.md](../SETUP.md)
