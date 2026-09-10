pub type Salt = [u8; 16];

pub fn generate_random_salt() -> Salt {
    let mut salt = [0u8; 16];
    rand::fill(&mut salt);
    salt
}

pub fn is_valid_salt(salt: &[u8]) -> bool {
    salt.len() == 16
}
