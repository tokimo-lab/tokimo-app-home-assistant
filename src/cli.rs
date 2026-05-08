//! CLI entrypoints for Home Assistant.

use anyhow::Context;
use tokimo_bus_auth::db::{connect_db, verify_token};
use tokimo_bus_cli::{Credentials, TokimoAuthArgs};
use uuid::Uuid;

use crate::Command;

pub async fn run(auth: TokimoAuthArgs, command: Command) -> anyhow::Result<()> {
    let user_id = authenticate(auth).await?;
    println!("Authenticated as user_id={user_id}");

    // TODO: implement HA-specific commands here, reusing existing handlers/services
    match command {
        Command::Status => {
            println!("home-assistant CLI: TODO");
        }
    }

    Ok(())
}

async fn authenticate(auth: TokimoAuthArgs) -> anyhow::Result<Uuid> {
    let credentials = match Credentials::resolve(&auth).context("resolve Tokimo credentials failed") {
        Ok(credentials) => credentials,
        Err(error) => anyhow::bail!("{error:#}"),
    };
    let db = match connect_db().await.context("connect database failed") {
        Ok(db) => db,
        Err(error) => anyhow::bail!("{error:#}"),
    };
    let verified = match verify_token(&db, &credentials.token)
        .await
        .context("verify Tokimo token failed")
    {
        Ok(verified) => verified,
        Err(error) => anyhow::bail!("{error:#}"),
    };

    Ok(verified.user_id)
}
