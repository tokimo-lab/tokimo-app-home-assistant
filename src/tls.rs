//! TLS connector helpers.
//!
//! When an instance is configured with `verify_tls = false` the user has
//! explicitly opted out of certificate validation (typical for self-signed
//! HA installs on a LAN). For both reqwest and tokio-tungstenite we then
//! provide a connector / client that accepts any server certificate.

use std::sync::{Arc, OnceLock};

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};
use tokio_tungstenite::Connector;

/// Install a process-level rustls `CryptoProvider` exactly once.
///
/// rustls 0.23 requires a global provider before `ClientConfig::builder()` can
/// run; without it the builder panics. Both the `verify_tls=true` (default
/// connector built by tokio-tungstenite) and `verify_tls=false` (our custom
/// connector) paths need this, so we centralize it here.
fn ensure_crypto_provider() {
    static PROVIDER_INIT: OnceLock<()> = OnceLock::new();
    PROVIDER_INIT.get_or_init(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

/// A `ServerCertVerifier` that accepts every server certificate.
///
/// Used only when the instance config has `verify_tls = false`.
#[derive(Debug)]
struct NoVerify;

impl ServerCertVerifier for NoVerify {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _msg: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _msg: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ED25519,
        ]
    }
}

/// Build a tokio-tungstenite `Connector` honoring `verify_tls`.
///
/// Returns `None` (default verifier) when verification is on.
pub fn ws_connector(verify_tls: bool) -> Option<Connector> {
    ensure_crypto_provider();
    if verify_tls {
        return None;
    }
    let config = ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoVerify))
        .with_no_client_auth();
    Some(Connector::Rustls(Arc::new(config)))
}

/// Build a per-instance reqwest client honoring `verify_tls`.
pub fn build_http_client(verify_tls: bool) -> reqwest::Client {
    let mut builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30));
    if !verify_tls {
        builder = builder.danger_accept_invalid_certs(true);
    }
    builder
        .build()
        .expect("reqwest client build cannot fail with these options")
}
