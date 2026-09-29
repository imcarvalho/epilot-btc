/**
 * A stand-in for Google's OpenID endpoints, for driving the real Auth.js
 * sign-in flow in tests: discovery, the key set and the token endpoint, served
 * through the provider's `customFetch` hook so nothing touches the network.
 * Each test says what the id token it is handed looks like.
 */

import { createSign, generateKeyPairSync } from 'node:crypto';

const ISSUER = 'https://accounts.google.com';

const b64 = (value: string | Buffer) =>
	Buffer.from(value).toString('base64url');

export interface IdTokenOptions {
	sub?: string | null;
	/** Defaults to the client id the app is configured with. */
	aud?: string;
	iss?: string;
	/** Seconds from now; negative is already expired. */
	expiresIn?: number;
	/** Signed with a key that is not the one in the key set. */
	signWith?: 'google' | 'stranger';
	/** Flip the last character of the signature. */
	tamperSignature?: boolean;
	/** Extra claims Google would send if more than `openid` were asked for. */
	claims?: Record<string, unknown>;
}

export function createFakeGoogle(clientId: string) {
	const google = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	const stranger = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	const jwk = {
		...google.publicKey.export({
			format: 'jwk',
		}),
		kid: 'google-key',
		alg: 'RS256',
		use: 'sig',
	};

	let next: IdTokenOptions = {};

	function idToken(options: IdTokenOptions) {
		const now = Math.floor(Date.now() / 1000);
		const key = options.signWith === 'stranger' ? stranger : google;
		const head = b64(
			JSON.stringify({
				alg: 'RS256',
				kid: 'google-key',
			}),
		);
		const body = b64(
			JSON.stringify({
				iss: options.iss ?? ISSUER,
				aud: options.aud ?? clientId,
				iat: now - 10,
				exp: now + (options.expiresIn ?? 3600),
				...(options.sub === null
					? {}
					: {
							sub: options.sub ?? 'google-sub-1',
						}),
				...options.claims,
			}),
		);
		const signature = createSign('RSA-SHA256')
			.update(`${head}.${body}`)
			.sign(key.privateKey);
		const encoded = b64(signature);
		const last = encoded.endsWith('A') ? 'B' : 'A';
		return `${head}.${body}.${
			options.tamperSignature ? encoded.slice(0, -1) + last : encoded
		}`;
	}

	const json = (body: unknown) =>
		new Response(JSON.stringify(body), {
			headers: {
				'content-type': 'application/json',
			},
		});

	async function fetchGoogle(input: RequestInfo | URL): Promise<Response> {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith('/.well-known/openid-configuration')) {
			return json({
				issuer: ISSUER,
				authorization_endpoint: `${ISSUER}/o/oauth2/v2/auth`,
				token_endpoint: `${ISSUER}/token`,
				jwks_uri: `${ISSUER}/jwks`,
				userinfo_endpoint: `${ISSUER}/userinfo`,
				id_token_signing_alg_values_supported: ['RS256'],
			});
		}
		if (url === `${ISSUER}/jwks`) {
			return json({
				keys: [jwk],
			});
		}
		if (url === `${ISSUER}/token`) {
			return json({
				access_token: 'fake-access-token',
				token_type: 'Bearer',
				expires_in: 3600,
				id_token: idToken(next),
			});
		}
		throw new Error(`the fake Google was asked for ${url}`);
	}

	return {
		fetch: fetchGoogle,
		/** The id token Google's token endpoint will hand back next. */
		respondWith(options: IdTokenOptions) {
			next = options;
		},
	};
}
